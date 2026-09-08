"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUser } from "./actions";

const fieldClass =
  "rounded-xl border border-neutral-border px-3 py-2 text-sm text-move-navy placeholder:italic placeholder:text-gray-400 focus:border-move-green focus:outline-none focus:ring-2 focus:ring-move-green";
const labelClass = "text-sm font-medium text-move-navy";

type Role = "admin" | "logistics_expert";

const ROLE_ITEMS = [
  { value: "logistics_expert", label: "Logistics Expert" },
  { value: "admin", label: "Admin" },
];

const initialState = {
  email: "",
  password: "",
  firstName: "",
  role: "logistics_expert" as Role,
};

export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createUser(
        form.email,
        form.password,
        form.firstName,
        form.role,
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setForm(initialState);
          setError(null);
          setSuccess(false);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" />}>
        Create User
      </DialogTrigger>
      <DialogContent>
        {success ? (
          <>
            <DialogHeader>
              <DialogTitle>User Created</DialogTitle>
              <DialogDescription>
                {form.email} was created successfully.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button type="button" />}>
                Done
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>
                Adds a new user directly, with a working login.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="new-user-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="new-user-email"
                  type="email"
                  required
                  placeholder="e.g. jane@acmelogistics.com"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className={fieldClass}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="new-user-password" className={labelClass}>
                  Password
                </label>
                <input
                  id="new-user-password"
                  type="password"
                  required
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className={fieldClass}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="new-user-first-name" className={labelClass}>
                  First Name
                </label>
                <input
                  id="new-user-first-name"
                  type="text"
                  placeholder="e.g. Jane"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      firstName: e.target.value,
                    }))
                  }
                  className={fieldClass}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="new-user-role" className={labelClass}>
                  Role
                </label>
                <Select
                  name="role"
                  items={ROLE_ITEMS}
                  value={form.role}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, role: value as Role }))
                  }
                >
                  <SelectTrigger
                    id="new-user-role"
                    className="w-full rounded-xl border-neutral-border"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={handleCreate}
              >
                {isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
