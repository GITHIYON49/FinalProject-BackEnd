export const emailTemplates = {
  taskAssigned: (taskTitle, assignedBy, projectName) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">New Task Assigned</h2>
      <p>You have been assigned a new task:</p>
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Task:</strong> ${taskTitle}</p>
        <p><strong>Project:</strong> ${projectName}</p>
        <p><strong>Assigned by:</strong> ${assignedBy}</p>
      </div>
      <p>Please log in to view more details and get started.</p>
    </div>
  `,

  taskDueSoon: (taskTitle, dueDate) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #f59e0b;">Task Due Soon</h2>
      <p>This is a reminder that your task is due soon:</p>
      <div style="background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Task:</strong> ${taskTitle}</p>
        <p><strong>Due Date:</strong> ${dueDate}</p>
      </div>
      <p>Please complete it before the deadline.</p>
    </div>
  `,

  projectInvite: (projectName, invitedBy) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Project Invitation</h2>
      <p>You have been invited to join a project:</p>
      <div style="background-color: #d1fae5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Project:</strong> ${projectName}</p>
        <p><strong>Invited by:</strong> ${invitedBy}</p>
      </div>
      <p>Log in to accept the invitation and start collaborating.</p>
    </div>
  `,

  welcomeEmail: (userName) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">Welcome to Task Manager!</h2>
      <p>Hi ${userName},</p>
      <p>Thank you for signing up! We're excited to have you on board.</p>
      <p>Get started by creating your first project and inviting team members to collaborate.</p>
      <p>If you have any questions, feel free to reach out to our support team.</p>
      <p>Happy task managing!</p>
    </div>
  `,
};
