import { toast } from "sonner";
import { updateAnimalTaskStatus } from "@/app/lib/actions/animal-task.actions";
import { TaskStatus } from "@/prisma/generated/enums";

// The row menus' status changes, shared by the animal's Tasks tab and the
// Animal Tasks page. Each waits for the server and says what it answered: a
// refusal, such as reopening a task of an animal that has left, shows its
// message rather than a success the server never gave.

/** Sets the task's status from the row's Status menu. */
export const changeTaskStatus = async (taskId: string, status: TaskStatus) => {
  const result = await updateAnimalTaskStatus(taskId, status);
  if (result.success) {
    toast.success("Task status updated");
  } else {
    toast.error(result.message);
  }
};

/** Moves the task to the trash, offering Undo back to the status it had. */
export const moveTaskToTrash = async (
  taskId: string,
  originalStatus: TaskStatus,
) => {
  const result = await updateAnimalTaskStatus(taskId, TaskStatus.DELETED);
  if (!result.success) {
    toast.error(result.message);
    return;
  }
  toast.success("Task moved to trash.", {
    action: {
      label: "Undo",
      onClick: async () => {
        const restored = await updateAnimalTaskStatus(taskId, originalStatus);
        if (restored.success) {
          toast.info("Task restored.");
        } else {
          toast.error(restored.message);
        }
      },
    },
  });
};
