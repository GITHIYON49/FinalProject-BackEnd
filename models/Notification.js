import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        'TASK_ASSIGNED',
        'TASK_UPDATED',
        'TASK_COMPLETED',
        'TASK_COMMENTED',
        'TASK_SHARED',
        'TASK_DUE',
        'PROJECT_CREATED',
        'PROJECT_UPDATED',
        'PROJECT_MEMBER', 
        'MEMBER_ADDED',     
        'MEMBER_REMOVED',   
        'TEAM_INVITE',      
        'GENERAL',
      ],
      default: 'GENERAL',
    },
    link: {
      type: String,
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);


notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;