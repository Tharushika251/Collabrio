import { z } from 'zod';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';

const registerSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const { name, email, password } = parsed.data;
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: 'Email already registered' });

  const user = await User.create({ name, email, password });
  res.status(201).json({
    user: { id: user._id, name: user.name, email: user.email },
    token: generateToken(user._id),
  });
}

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const { email, password } = parsed.data;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  res.json({
    user: { id: user._id, name: user.name, email: user.email },
    token: generateToken(user._id),
  });
}

export async function me(req, res) {
  res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email } });
}