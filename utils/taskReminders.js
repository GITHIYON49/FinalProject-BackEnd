import cron from "node-cron";
import Task from "../models/Task.js";
import sendEmail from "./sendEmail.js";

export const startTaskReminderCron = () => {
  cron.schedule("0 9 * * *", async () => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const tasksDueTomorrow = await Task.find({
        due_date: {
          $gte: tomorrow,
          $lt: dayAfter,
        },
        status: { $ne: "COMPLETED" },
        assignee: { $ne: null },
      })
        .populate("assignee", "name email")
        .populate("project", "name")
        .populate("createdBy", "name");

      for (const task of tasksDueTomorrow) {
        if (!task.assignee || !task.assignee.email) continue;

        try {
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">Task Due Tomorrow</h2>
              <p>Hi ${task.assignee.name},</p>
              <p>This is a friendly reminder that the following task is due tomorrow:</p>
              <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #92400e;">${task.title}</h3>
                <p style="color: #78350f;">${task.description || "No description"}</p>
                <hr style="border: none; border-top: 1px solid #fbbf24; margin: 15px 0;">
                <p style="color: #78350f;"><strong>Project:</strong> ${task.project?.name || "Unknown"}</p>
                <p style="color: #78350f;"><strong>Priority:</strong> ${task.priority}</p>
                <p style="color: #78350f;"><strong>Due Date:</strong> ${new Date(task.due_date).toLocaleDateString()}</p>
              </div>
              <p>
                <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects/${task.project._id}/tasks/${task._id}" 
                   style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0;">
                  View Task
                </a>
              </p>
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                Don't forget to complete this task before the deadline!
              </p>
            </div>
          `;

          await sendEmail({
            email: task.assignee.email,
            subject: `Reminder: Task "${task.title}" Due Tomorrow`,
            html: emailHtml,
          });
        } catch (emailError) {
          console.error(
            `Failed to send reminder for task ${task._id}:`,
            emailError,
          );
        }
      }
    } catch (error) {
      console.error("Error in task reminder cron:", error);
    }
  });
};
