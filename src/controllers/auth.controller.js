const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/auth');
const { findByEmail, createUser, findById } = require('../repositories/usuarios.repository');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const user = await findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!user.activo) {
      return res.status(403).json({ error: 'Usuario desactivado' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function registro(req, res, next) {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existing = await findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    const user = await createUser({ nombre, email, password });

    const token = signToken({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, registro, me };