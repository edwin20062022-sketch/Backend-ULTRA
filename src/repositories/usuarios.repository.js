const supabase = require('../utils/db');
const bcrypt = require('bcryptjs');

async function findByEmail(email) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .single();

  if (error) return null;
  return data;
}

async function createUser({ nombre, email, password }) {
  const hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('usuarios')
    .insert([{ nombre, email, password: hash }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, email, rol, activo, creado_en')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

module.exports = { findByEmail, createUser, findById };