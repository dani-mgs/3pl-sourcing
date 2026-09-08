create policy "Owner or admin can delete client requirements"
  on client_requirements for delete to authenticated
  using (owner_id = auth.uid() or is_admin());

grant delete on table client_requirements to authenticated;
