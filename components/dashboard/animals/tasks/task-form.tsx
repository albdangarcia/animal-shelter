"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useForm } from "react-hook-form";
import { parseISO } from "date-fns";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DayField } from "@/components/forms/day-field";
import {
  TaskCategoryOptions,
  TaskPriorityOptions,
  TaskStatusOptions,
} from "@/app/lib/utils/enum-formatter";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import {
  createTaskFormSchema,
  TaskFormSchema,
} from "@/app/lib/zod-schemas/animal.schemas";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { TaskAssignee } from "@/app/lib/types";
import { TaskPriority, TaskStatus } from "@/prisma/generated/enums";
import {
  createAnimalTask,
  updateAnimalTask,
} from "@/app/lib/actions/animal-task.actions";
import { FetchAnimalTasksPayload } from "@/app/lib/data/animals/animal-task.data";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { toast } from "sonner";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";

// The INPUT side: while the form is being filled in, a due date is still the
// plain `yyyy-MM-dd` string the picker writes. react-hook-form maps a branded
// string into a nested `dirtyFields` shape, so the output type cannot be used
// here.
type TaskFormValues = z.input<typeof TaskFormSchema>;

interface TaskFormProps {
  animalId: string;
  onFormSubmit: () => void; // To close the dialog on success
  ref?: React.Ref<DirtyFormHandle>;
  assigneeList: TaskAssignee[];
  task?: FetchAnimalTasksPayload;
  /**
   * Today, on the shelter's calendar, resolved on the server and handed down.
   * The browser is not told the shelter's timezone, so it cannot work this out
   * for itself — and a `new Date()` here would answer in the viewer's zone,
   * which is a different day for part of every evening. The create action
   * re-checks the same rule against the day it resolves itself.
   */
  today: CalendarDay;
}

export const TaskForm = ({
  animalId,
  onFormSubmit,
  ref,
  assigneeList,
  task,
  today,
}: TaskFormProps) => {
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<TaskFormValues>({
    resolver: standardSchemaResolver(
      task ? TaskFormSchema : createTaskFormSchema(today),
    ),
    defaultValues: task
      ? {
          title: task.title,
          details: task.details || "",
          category: task.category,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate ?? undefined,
          assigneeId: task.assignee?.id || undefined,
        }
      : {
          title: "",
          details: "",
          category: undefined,
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM,
          dueDate: undefined,
          assigneeId: undefined,
        },
  });

  const initialValuesRef = useRef(form.getValues());

  useImperativeHandle(
    ref,
    () => ({
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
    }),
    [form],
  );

  // No FormData: the values are already validated and correctly typed, so they
  // go to the server as-is. A due date travels as the day string the picker
  // wrote, which needs no encoding in either direction.
  //
  // Closing the dialog happens here, in the handler, rather than in an effect
  // watching action state. That effect was the same cascading-render pattern
  // react-hooks/set-state-in-effect flags — it just went unreported because
  // onFormSubmit is a prop, so the rule couldn't see the setter it calls.
  const onSubmit = (values: TaskFormValues) => {
    startSubmitTransition(async () => {
      const result = task
        ? await updateAnimalTask(task.id, animalId, values)
        : await createAnimalTask(animalId, values);

      if (result.ok) {
        toast.success(result.message);
        onFormSubmit(); // Close dialog on success
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Title */}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="col-span-full">
                <FormLabel>Title *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Administer medication" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Details */}
          <FormField
            control={form.control}
            name="details"
            render={({ field }) => (
              <FormItem className="col-span-full">
                <FormLabel>Details</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Provide a detailed description of the task..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Category */}
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem className="md:col-span-3">
                <FormLabel>Category *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TaskCategoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Status */}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem className="md:col-span-3 md:col-start-4 self-start">
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TaskStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Priority */}
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TaskPriorityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Due Date */}
          <DayField
            control={form.control}
            name="dueDate"
            label="Due Date"
            className="md:col-span-2 md:col-start-4"
            triggerClassName="w-full pl-3"
            // An existing task keeps whatever due date it already has; a new
            // one can't be created already overdue. The grid works in local
            // dates, so the shelter's day is read as one to compare against.
            disabledDates={(date) =>
              date < parseISO(task ? "1900-01-01" : today)
            }
          />

          <FormField
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <FormItem className="md:col-span-3">
                <FormLabel>Assign to</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a staff member or volunteer" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {assigneeList.map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        {assignee.name || assignee.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {task ? "Updating..." : "Creating..."}
              </>
            ) : task ? (
              "Update Task"
            ) : (
              "Create Task"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};
