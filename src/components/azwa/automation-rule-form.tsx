import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { createAutomationRule } from "@/lib/automation/rules.functions";
import { TRIGGER_TYPES, type ActionDef, type Condition } from "@/lib/automation/types";

const CONDITION_TYPES = ["keyword", "contact_tag", "message_type"] as const;
const ACTION_TYPES = ["send_message", "add_tag", "remove_tag"] as const;

type ConditionRow = { type: (typeof CONDITION_TYPES)[number]; value: string };
type ActionRow = { type: (typeof ACTION_TYPES)[number]; value: string };

type FormValues = {
  name: string;
  description: string;
  triggerType: (typeof TRIGGER_TYPES)[number];
  priority: number;
  isEnabled: boolean;
  conditions: ConditionRow[];
  actions: ActionRow[];
};

function rowToCondition(row: ConditionRow): Condition | null {
  if (!row.value.trim()) return null;
  if (row.type === "keyword") {
    return {
      type: "keyword",
      keywords: row.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      matchMode: "contains",
    };
  }
  if (row.type === "contact_tag") return { type: "contact_tag", tagName: row.value.trim() };
  return { type: "message_type", value: row.value.trim() };
}

function rowToAction(row: ActionRow): ActionDef | null {
  if (!row.value.trim()) return null;
  if (row.type === "send_message") return { type: "send_message", body: row.value };
  if (row.type === "add_tag") return { type: "add_tag", tagName: row.value.trim() };
  return { type: "remove_tag", tagName: row.value.trim() };
}

/** Single-row organizations lookup — this install is single-tenant. */
function useDefaultOrganizationId() {
  return useQuery({
    queryKey: ["default-organization-id"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id as string | undefined;
    },
  });
}

export function AutomationRuleFormDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: organizationId } = useDefaultOrganizationId();

  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      description: "",
      triggerType: "message_received",
      priority: 100,
      isEnabled: true,
      conditions: [],
      actions: [{ type: "send_message", value: "" }],
    },
  });

  const conditionFields = useFieldArray({ control: form.control, name: "conditions" });
  const actionFields = useFieldArray({ control: form.control, name: "actions" });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!organizationId) throw new Error("No organization found for this install");
      const conditions = values.conditions
        .map(rowToCondition)
        .filter((c): c is Condition => c !== null);
      const actions = values.actions.map(rowToAction).filter((a): a is ActionDef => a !== null);
      if (actions.length === 0) throw new Error("At least one action with a value is required");

      return createAutomationRule({
        data: {
          organizationId,
          name: values.name,
          ...(values.description ? { description: values.description } : {}),
          triggerType: values.triggerType,
          conditions,
          actions,
          priority: values.priority,
          isEnabled: values.isEnabled,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["record-table", "automation_rules"] });
      setOpen(false);
      form.reset();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> New rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New automation rule</DialogTitle>
          <DialogDescription>
            Runs automatically whenever the selected trigger fires and every condition below passes.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <FormField
              control={form.control}
              name="name"
              rules={{ required: true }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Auto-reply to pricing keyword" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="triggerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trigger</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRIGGER_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority (lower runs first)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                  <FormLabel className="!mt-0">Enabled immediately</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <FormLabel>Conditions (all must match — leave empty to always run)</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => conditionFields.append({ type: "keyword", value: "" })}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add condition
                </Button>
              </div>
              {conditionFields.fields.map((f, index) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Select
                    value={form.watch(`conditions.${index}.type`)}
                    onValueChange={(v) =>
                      form.setValue(`conditions.${index}.type`, v as ConditionRow["type"])
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    placeholder={
                      form.watch(`conditions.${index}.type`) === "keyword"
                        ? "keyword1, keyword2"
                        : "value"
                    }
                    {...form.register(`conditions.${index}.value`)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => conditionFields.remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <FormLabel>Actions (run in order)</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => actionFields.append({ type: "send_message", value: "" })}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add action
                </Button>
              </div>
              {actionFields.fields.map((f, index) => (
                <div key={f.id} className="flex items-start gap-2">
                  <Select
                    value={form.watch(`actions.${index}.type`)}
                    onValueChange={(v) =>
                      form.setValue(`actions.${index}.type`, v as ActionRow["type"])
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.watch(`actions.${index}.type`) === "send_message" ? (
                    <Textarea
                      className="flex-1"
                      rows={2}
                      placeholder="Message body to send back"
                      {...form.register(`actions.${index}.value`)}
                    />
                  ) : (
                    <Input
                      className="flex-1"
                      placeholder="tag name"
                      {...form.register(`actions.${index}.value`)}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => actionFields.remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {mutation.isError ? (
              <p className="text-sm text-destructive">
                {mutation.error instanceof Error ? mutation.error.message : "Failed to create rule"}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create rule"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
