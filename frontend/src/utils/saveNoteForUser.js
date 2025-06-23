import { supabase } from '../supabaseClient';

export async function saveNoteForUser(user, content) {
  if (!user || !user.id) throw new Error('No user');
  const { error } = await supabase
    .from('notes')
    .insert([{ user_id: user.id, content }]);
  if (error) throw error;
}

export default saveNoteForUser; 