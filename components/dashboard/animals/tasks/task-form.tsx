"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  TaskCategoryOptions,
  TaskPriorityOptions,
  TaskStatusOptions,
} from "@/app/lib/utils/enum-formatter";
import { AnimalTaskFormState } from "@/app/lib/form-state-types";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { TaskFormSchema } from "@/app/lib/zod-schemas/animal.schemas";
import { TaskAssignee } from "@/app/lib/types";
import { TaskPriority, TaskStatus } from "@/prisma/generated/enums";
import {
  createAnimalTask,
  updateAnimalTask,
} from "@/app/lib/actions/animal-task.actions";
import { FetchAnimalTasksPayload } from "@/app/lib/data/animals/animal-task.data";
import { toast } from "sonner";

type TaskFormValues = z.infer<typeof TaskFormSchema>;

const INITIAL_FORM_STATE = { success: false, message: null, errors: {} };

interface TaskFormProps {
  animalId: string;
  onFormSubmit: () => void; // To close the dialog on success
  assigneeList: TaskAssignee[];
  task?: FetchAnimalTasksPayload;
}

export const TaskForm = ({
  animalId,
  onFormSubmit,
  assigneeList,
  task,
}: TaskFormProps) => {
  const action = task
    ? updateAnimalTask.bind(null, task.id, animalId)
    : createAnimalTask.bind(null, animalId);

  const [state, formAction, isPending] = useActionState<
    AnimalTaskFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

  const form = useForm({
    resolver: zodResolver(TaskFormSchema),
    defaultValues: task
      ? {
          title: task.title,
          details: task.details || "",
          category: task.category,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
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

  useEffect(() => {
    // If there's no message, do nothing.
    if (!state.message) {
      return;
    }

    // If the action was successful, show a success toast and close the form.
    if (state.success) {
      toast.success(state.message);
      onFormSubmit(); // Close dialog on success
    }
    // If it failed and there are specific field errors, set them on the form.
    else if (state.errors) {
      for (const [key, value] of Object.entries(state.errors)) {
        form.setError(key as keyof TaskFormValues, {
          type: "server",
          message: value?.join(", "),
        });
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, onFormSubmit]);

  const onSubmit = (data: TaskFormValues) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        formData.append(key, value.toISOString());
      } else if (value != null && value !== "") {
        formData.append(key, String(value));
      }
    }
    startTransition(() => {
      formAction(formData);
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
                <FormLabel>Title</FormLabel>
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
                <FormLabel>Category</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
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
                    {/* Assuming you create TaskPriorityOptions */}
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
          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => {
              const dateValue = field.value as Date | undefined;

              return (
                <FormItem className="md:col-span-2 md:col-start-4">
                  <FormLabel>Due Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !dateValue && "text-muted-foreground"
                          )}
                        >
                          {dateValue ? (
                            format(dateValue, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateValue}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date("1900-01-01")}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <FormItem className="md:col-span-3">
                <FormLabel>Assign to</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
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
