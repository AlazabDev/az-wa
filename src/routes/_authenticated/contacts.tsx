import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Phone, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addContactChannel,
  createContact,
  deleteContact,
  removeContactChannel,
  updateContact,
} from "@/lib/contacts.functions";
import { readRecordTable } from "@/lib/record-table.functions";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({ meta: [{ title: "Contacts — AzWA" }] }),
  component: ContactsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ContactRow = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  status: string;
  source: string | null;
  assigned_user_id: string | null;
  assigned_team_id: string | null;
  last_interaction_at: string | null;
  created_at: string;
};

type ChannelRow = {
  id: string;
  contact_id: string;
  channel_type: string;
  address: string;
  wa_id: string | null;
  profile_name: string | null;
  is_primary: boolean;
  updated_at: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

// ─── Contact form dialog ──────────────────────────────────────────────────────

function ContactFormDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: ContactRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const doCreate = useServerFn(createContact);
  const doUpdate = useServerFn(updateContact);

  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(initial);

  async function handleSave() {
    if (!displayName.trim()) {
      toast.error("Display name is required");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && initial) {
        await doUpdate({
          data: {
            contactId: initial.id,
            displayName,
            email: email || null,
            phone: phone || null,
            company: company || null,
            notes: notes || null,
          },
        });
        toast.success("Contact updated");
      } else {
        await doCreate({
          data: {
            displayName,
            email: email || null,
            phone: phone || null,
            company: company || null,
            notes: notes || null,
            primaryPhone: primaryPhone || null,
          },
        });
        toast.success("Contact created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <h2 className="text-base font-semibold">{isEdit ? "Edit contact" : "New contact"}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Field label="Display name *">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Mohammed Al-Azzab"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="user@example.com"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2010xxxxxxxx"
                inputMode="tel"
              />
            </Field>
          </div>
          <Field label="Company">
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name"
            />
          </Field>
          <Field label="Notes">
            <textarea
              className={`${inputClass} min-h-20 py-2 h-auto`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes…"
            />
          </Field>
          {!isEdit && (
            <Field label="Primary WhatsApp number (optional)">
              <Input
                value={primaryPhone}
                onChange={(e) => setPrimaryPhone(e.target.value)}
                placeholder="2010xxxxxxxx"
                inputMode="tel"
              />
            </Field>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !displayName.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create contact"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add channel dialog ───────────────────────────────────────────────────────

function AddChannelDialog({
  contactId,
  onClose,
  onSaved,
}: {
  contactId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const doAdd = useServerFn(addContactChannel);
  const [address, setAddress] = useState("");
  const [profileName, setProfileName] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const phone = address.replace(/[^0-9]/g, "");
    if (phone.length < 7) {
      toast.error("Enter a valid phone number");
      return;
    }
    setSaving(true);
    try {
      await doAdd({
        data: { contactId, address: phone, profileName: profileName || null, isPrimary },
      });
      toast.success("Channel added");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add channel");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <h2 className="text-base font-semibold">Add WhatsApp channel</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Field label="WhatsApp number *">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="2010xxxxxxxx"
              inputMode="tel"
            />
          </Field>
          <Field label="Profile name (optional)">
            <Input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Name shown in WhatsApp"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded"
            />
            Set as primary channel
          </label>
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add channel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Contact detail panel ─────────────────────────────────────────────────────

function ContactDetailPanel({
  contact,
  onClose,
  onEdit,
  onDeleted,
}: {
  contact: ContactRow;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const doDelete = useServerFn(deleteContact);
  const doRemoveChannel = useServerFn(removeContactChannel);
  const readRecords = useServerFn(readRecordTable);

  const [addingChannel, setAddingChannel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingChannelId, setRemovingChannelId] = useState<string | null>(null);

  const { data: channelData, refetch: refetchChannels } = useQuery({
    queryKey: ["contact-channels", contact.id],
    queryFn: () =>
      readRecords({
        data: {
          table: "contact_channels",
          orderBy: "updated_at",
          limit: 20,
        },
      }),
  });

  const channels: ChannelRow[] = useMemo(
    () => ((channelData?.rows ?? []) as ChannelRow[]).filter((ch) => ch.contact_id === contact.id),
    [channelData, contact.id],
  );

  async function handleDelete() {
    if (!window.confirm(`Archive contact "${contact.display_name}"?`)) return;
    setDeleting(true);
    try {
      await doDelete({ data: { contactId: contact.id } });
      toast.success("Contact archived");
      queryClient.invalidateQueries({ queryKey: ["record-table"] });
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive contact");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRemoveChannel(channelId: string) {
    setRemovingChannelId(channelId);
    try {
      await doRemoveChannel({ data: { channelId } });
      toast.success("Channel removed");
      await refetchChannels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove channel");
    } finally {
      setRemovingChannelId(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between border-b border-border bg-muted/20 px-4 py-3 gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-sm truncate">{contact.display_name}</h2>
          {contact.company && (
            <p className="text-xs text-muted-foreground mt-0.5">{contact.company}</p>
          )}
          <div className="mt-1.5">
            <StatusBadge value={contact.status} />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Contact info */}
        <dl className="space-y-2 text-xs">
          {[
            { label: "Email", value: contact.email },
            { label: "Phone", value: contact.phone },
            { label: "Source", value: contact.source },
            { label: "Last interaction", value: formatDate(contact.last_interaction_at) },
            { label: "Created", value: formatDate(contact.created_at) },
          ].map(
            (item) =>
              item.value && (
                <div
                  key={item.label}
                  className="flex justify-between gap-4 border-b border-border/50 pb-1.5"
                >
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="font-medium text-right break-all">{item.value}</dd>
                </div>
              ),
          )}
        </dl>

        {contact.notes && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
            {contact.notes}
          </div>
        )}

        {/* Channels */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              WhatsApp channels
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setAddingChannel(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground">No channels linked yet.</p>
          ) : (
            <div className="space-y-2">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-medium">{ch.address}</p>
                    {ch.profile_name && (
                      <p className="text-[10px] text-muted-foreground">{ch.profile_name}</p>
                    )}
                  </div>
                  {ch.is_primary && (
                    <span className="shrink-0 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      Primary
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={removingChannelId === ch.id}
                    onClick={() => handleRemoveChannel(ch.id)}
                  >
                    {removingChannelId === ch.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {addingChannel && (
        <AddChannelDialog
          contactId={contact.id}
          onClose={() => setAddingChannel(false)}
          onSaved={async () => {
            setAddingChannel(false);
            await refetchChannels();
          }}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

function ContactsPage() {
  const queryClient = useQueryClient();
  const readRecords = useServerFn(readRecordTable);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ContactRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["record-table", "contacts", "last_interaction_at", PAGE_SIZE, page],
    queryFn: () =>
      readRecords({
        data: { table: "contacts", orderBy: "last_interaction_at", limit: PAGE_SIZE, page },
      }),
    refetchInterval: 30_000,
  });

  const rows: ContactRow[] = useMemo(() => (data?.rows ?? []) as ContactRow[], [data]);
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.display_name, c.email, c.phone, c.company].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [rows, search, statusFilter]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["record-table", "contacts"] });
  }, [queryClient]);

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      {/* Header */}
      <div className="flex-none p-4 pb-2">
        <PageHeader
          title="Contacts"
          description="Customer identities with WhatsApp channels, conversation history and team assignments."
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> New contact
            </Button>
          }
        />
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden p-4 pt-2 gap-4">
        {/* Left: list */}
        <div
          className={`flex flex-col flex-1 min-w-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden ${selected ? "hidden lg:flex" : "flex"}`}
        >
          {/* Filters */}
          <div className="p-4 border-b border-border bg-muted/20">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name, email, phone…"
                  className="pl-9"
                />
              </div>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading contacts…
              </div>
            ) : visible.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No contacts found"
                  hint='Create your first contact using the "New contact" button.'
                />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-3 px-4 font-medium">Name</th>
                    <th className="py-3 pr-4 font-medium">Phone</th>
                    <th className="py-3 pr-4 font-medium">Email</th>
                    <th className="py-3 pr-4 font-medium">Company</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Last interaction</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((contact) => (
                    <tr
                      key={contact.id}
                      className={`cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors ${selected?.id === contact.id ? "bg-primary/5" : ""}`}
                      onClick={() => setSelected(contact)}
                    >
                      <td className="py-3 px-4 font-medium">{contact.display_name}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                        {contact.phone ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {contact.email ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs">{contact.company ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge value={contact.status} />
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {formatDate(contact.last_interaction_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {total.toLocaleString()} contacts · page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: detail */}
        {selected && (
          <div className="w-full lg:w-[380px] flex-none flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden animate-in slide-in-from-right-4 duration-200">
            <ContactDetailPanel
              key={selected.id}
              contact={selected}
              onClose={() => setSelected(null)}
              onEdit={() => setEditing(selected)}
              onDeleted={() => {
                setSelected(null);
                invalidate();
              }}
            />
          </div>
        )}
      </div>

      {/* Create dialog */}
      {creating && (
        <ContactFormDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            invalidate();
          }}
        />
      )}

      {/* Edit dialog */}
      {editing && (
        <ContactFormDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            // Update selected with new name if same contact
            setSelected((prev) =>
              prev?.id === editing.id ? { ...prev, display_name: editing.display_name } : prev,
            );
            invalidate();
          }}
        />
      )}
    </div>
  );
}
