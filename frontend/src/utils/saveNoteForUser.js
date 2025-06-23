import { supabase } from '../supabaseClient';

export async function saveNoteForUser(user, content, audioFileName, timestamp) {
  if (!user || !user.id) throw new Error('No user');
  const insertObj = { user_id: user.id, content };
  if (audioFileName) insertObj.audio_file = audioFileName;
  if (typeof timestamp === 'number') insertObj.timestamp = timestamp;
  const { error } = await supabase
    .from('notes')
    .insert([insertObj]);
  if (error) throw error;
}

export default saveNoteForUser; 