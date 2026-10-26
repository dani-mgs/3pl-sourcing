# Golden fixtures for the Forwarder Audit engine (src/lib/forwarder-audit/).
#
# Recalculates the frozen v1.0 workbook in LibreOffice (headless) and writes
# what every formula cell evaluates to, so Vitest can compare the engine with
# the workbook cell by cell. Not an app dependency: run it by hand with
# any python3 after changing a case (it starts LibreOffice headless and runs
# itself inside it as a Python macro, so LibreOffice's bundled Python
# executable is never launched directly):
#
#   python3 scripts/forwarder-audit/golden.py
#
# Cases: the blank template, every filled workbook in docs/forwarder-audit/cases/
# (recalculated as they are) and every scripts/forwarder-audit/cases/*.json
# (its "cells" written into a fresh copy of the template; "YYYY-MM-DD" strings
# become dates). Output: src/lib/forwarder-audit/__fixtures__/golden/<case>.json
# holding the case's input cells and the non-blank formula results, plus
# formula-cells.json listing every formula cell (a missing result means "").

import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date

ROOT = os.environ.get("FA_GOLDEN_ROOT") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEMPLATE = os.path.join(ROOT, "docs/forwarder-audit/Forwarder_Audit_Template_v1.0.xlsx")
REAL_CASES = os.path.join(ROOT, "docs/forwarder-audit/cases")
GENERATED_CASES = os.path.join(ROOT, "scripts/forwarder-audit/cases")
OUT = os.path.join(ROOT, "src/lib/forwarder-audit/__fixtures__/golden")
SHEETS = ["Audit", "Summary", "Lists", "Checks"]
FORMULA = 16  # com.sun.star.sheet.CellFlags.FORMULA
NULL_DATE = date(1899, 12, 30)  # LibreOffice's default day 0


def input_cells():
    # The Audit sheet's input cells (sections 1-4), as in cell-map.ts.
    cells = []
    for row in list(range(6, 22)) + list(range(23, 34)):
        cells += [f"C{row}", f"J{row}"]
    cells += ["D35", "D36", "D37", "D38", "G37", "G38"]
    for row in range(43, 50):
        cells += [f"C{row}", f"G{row}"]
    for row in range(54, 104):
        cells += [f"{col}{row}" for col in "BCDEFGIJKLMNO"]
    return cells


def prop(name, value):
    from com.sun.star.beans import PropertyValue
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


def open_doc(desktop, path):
    import uno
    return desktop.loadComponentFromURL(uno.systemPathToFileUrl(path), "_blank", 0, (prop("Hidden", True),))


def write_inputs(doc, cells):
    sheet = doc.Sheets.getByName("Audit")
    for ref, value in cells.items():
        cell = sheet.getCellRangeByName(ref)
        if value is None or value == "":
            cell.setString("")
        elif isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            cell.setValue((date.fromisoformat(value) - NULL_DATE).days)
        elif isinstance(value, (int, float)):
            cell.setValue(value)
        else:
            cell.setString(value)


def cell_value(cell):
    # 1 = VALUE, 2 = TEXT, 3 = FORMULA (com.sun.star.table.CellContentType)
    kind = cell.getType().value
    if kind == "EMPTY":
        return None
    if kind == "FORMULA":
        if cell.getError() != 0:
            return {"error": cell.getString()}
        # FormulaResultType2: 1 = VALUE, 2 = STRING
        return cell.getValue() if cell.FormulaResultType2 == 1 else cell.getString()
    if kind == "VALUE":
        return cell.getValue()
    return cell.getString()


def formula_cells(doc):
    out = []
    for name in SHEETS:
        sheet = doc.Sheets.getByName(name)
        ranges = sheet.queryContentCells(FORMULA)
        for addr in ranges.getRangeAddresses():
            for row in range(addr.StartRow, addr.EndRow + 1):
                for col in range(addr.StartColumn, addr.EndColumn + 1):
                    out.append((name, col, row))
    return out


def col_name(col):
    s = ""
    col += 1
    while col:
        col, r = divmod(col - 1, 26)
        s = chr(65 + r) + s
    return s


def read_case(doc, formulas):
    audit = doc.Sheets.getByName("Audit")
    inputs = {}
    for ref in input_cells():
        v = cell_value(audit.getCellRangeByName(ref))
        if v is not None and v != "":
            inputs[ref] = v
    outputs = {}
    for name, col, row in formulas:
        v = cell_value(doc.Sheets.getByName(name).getCellByPosition(col, row))
        if v is not None and v != "":
            outputs[f"{name}!{col_name(col)}{row + 1}"] = v
    return inputs, outputs


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=1, ensure_ascii=False, sort_keys=True)
        f.write("\n")


def generate(desktop, log):
    os.makedirs(OUT, exist_ok=True)
    template = open_doc(desktop, TEMPLATE)
    formulas = formula_cells(template)
    template.close(True)
    write_json(os.path.join(OUT, "formula-cells.json"),
               [f"{s}!{col_name(c)}{r + 1}" for s, c, r in formulas])

    cases = [("blank-template", TEMPLATE, None)]
    cases += [(os.path.splitext(os.path.basename(p))[0], p, None)
              for p in sorted(glob.glob(os.path.join(REAL_CASES, "*.xlsx")))]
    for p in sorted(glob.glob(os.path.join(GENERATED_CASES, "*.json"))):
        with open(p) as f:
            spec = json.load(f)
        cases.append((os.path.splitext(os.path.basename(p))[0], TEMPLATE, spec))

    for name, path, spec in cases:
        doc = open_doc(desktop, path)
        if spec:
            write_inputs(doc, spec["cells"])
        doc.calculateAll()
        inputs, outputs = read_case(doc, formulas)
        doc.close(True)
        write_json(os.path.join(OUT, f"{name}.json"), {
            "case": name,
            "description": spec["description"] if spec else os.path.relpath(path, ROOT),
            "inputs": inputs,
            "outputs": outputs,
        })
        log(f"{name}: {len(inputs)} inputs, {len(outputs)} non-blank results")


def run(*_args):
    # Macro entry point, inside LibreOffice.
    log_path = os.environ["FA_GOLDEN_LOG"]
    with open(log_path, "a") as log_file:
        def log(line):
            log_file.write(line + "\n")
            log_file.flush()
        desktop = XSCRIPTCONTEXT.getDesktop()  # noqa: F821 (provided by LibreOffice)
        try:
            generate(desktop, log)
            log("DONE")
        except Exception as error:  # reported to the launcher through the log
            import traceback
            log("FAILED " + "".join(traceback.format_exception(error)))
        finally:
            desktop.terminate()


g_exportedScripts = (run,)


def main():
    # Launcher, outside LibreOffice: a throwaway profile holding this script.
    profile = tempfile.mkdtemp(prefix="fa-golden-")
    scripts = os.path.join(profile, "user", "Scripts", "python")
    os.makedirs(scripts)
    shutil.copy(__file__, os.path.join(scripts, "fa_golden.py"))
    log_path = os.path.join(profile, "golden.log")
    open(log_path, "w").close()
    env = dict(os.environ, FA_GOLDEN_ROOT=ROOT, FA_GOLDEN_LOG=log_path)
    try:
        subprocess.run(
            ["soffice", "--headless", "--invisible", "--norestore", "--nologo",
             "-env:UserInstallation=file://" + profile,
             "vnd.sun.star.script:fa_golden.py$run?language=Python&location=user"],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
        with open(log_path) as f:
            text = f.read()
        print(text, end="")
        if "DONE" not in text:
            sys.exit("Golden fixtures were not generated (see above).")
    finally:
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
