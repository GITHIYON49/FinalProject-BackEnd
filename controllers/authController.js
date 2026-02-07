import { User } from "../models/index.js";
import generateToken from "../utils/generateToken.js";
import sendEmail from "../utils/sendEmail.js";
import { emailTemplates } from "../config/email.js";

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    console.log('📝 Registering new user:', req.body.email);

    const { name, email, password } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // ✅ Check if this is the first user
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: isFirstUser ? 'ADMIN' : 'MEMBER', // ✅ First user becomes ADMIN
      isTeamOwner: isFirstUser, // ✅ First user is team owner
    });

    console.log(`✅ User created: ${user.email} (${isFirstUser ? 'TEAM OWNER' : 'MEMBER'})`);

    // Generate token
    const token = generateToken(user._id);

    // Send welcome email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Welcome to Task Manager',
        html: emailTemplates.welcomeEmail(user.name),
      });
    } catch (emailError) {
      console.log('⚠️ Welcome email failed (non-critical):', emailError.message);
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isTeamOwner: user.isTeamOwner,
      token: token,
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body.email);

    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      console.log('✅ Login successful for:', user.email);

      // Generate token
      const token = generateToken(user._id);

      console.log('✅ Token generated');

      // Return user data with token
      const response = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        isTeamOwner: user.isTeamOwner, // ✅ Include team owner status
        token: token,
      };

      console.log('📤 Sending response');

      res.json(response);
    } else {
      console.log('❌ Invalid credentials for:', email);
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
      isTeamOwner: user.isTeamOwner, // ✅ Include team owner status
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.image = req.body.image || user.image;

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        image: updatedUser.image,
        token: generateToken(updatedUser._id),
      });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Invite new team member (Admin only)
// @route   POST /api/auth/invite
// @access  Private/Admin
// @desc    Invite new team member (Admin only)
// @route   POST /api/auth/invite
// @access  Private/Admin
export const inviteMember = async (req, res) => {
  try {
    console.log('📧 Inviting team member:', req.body);
    console.log('Invited by:', req.user);

    // ✅ Check if requester is team owner or admin
    if (!req.user.isTeamOwner && req.user.role !== 'ADMIN') {
      return res.status(403).json({ 
        message: 'Only team owner or admins can invite members' 
      });
    }

    const { name, email, role } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';

    // Create user
    const user = await User.create({
      name,
      email,
      password: tempPassword,
      role: role || 'MEMBER',
      invitedBy: req.user._id, // ✅ Track who invited this user
      isTeamOwner: false, // ✅ Invited users are never team owners
    });

    console.log('✅ User created:', user._id);

    // Send invitation email
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Welcome to TaskManager!</h2>
          <p>Hi ${name},</p>
          <p>You've been invited to join the TaskManager team by <strong>${req.user.name}</strong>.</p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Your Login Credentials</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code></p>
            <p style="color: #ef4444; font-size: 14px;">⚠️ Please change your password after first login</p>
          </div>
          <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #1e40af;">
              <strong>Your Role:</strong> ${role === 'ADMIN' ? 'Admin - You can manage projects and invite members' : 'Member - You can view and edit assigned tasks'}
            </p>
          </div>
          <p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" 
               style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0;">
              Login Now
            </a>
          </p>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            If you didn't expect this invitation, please ignore this email.
          </p>
        </div>
      `;

      await sendEmail({
        email: email,
        subject: 'You\'re Invited to Join TaskManager',
        html: emailHtml,
      });

      console.log('✅ Invitation email sent to:', email);
    } catch (emailError) {
      console.error('⚠️ Email failed (non-critical):', emailError.message);
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      invitedBy: req.user.name,
      message: 'Invitation sent successfully',
    });
  } catch (error) {
    console.error('❌ Error inviting member:', error);
    res.status(500).json({ message: error.message });
  }
};