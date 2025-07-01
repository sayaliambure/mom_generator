import { supabase } from '../supabaseClient';

export async function saveNoteForUser(user, content, audioFileName, timestamp, meeting_id) {
  if (!user || !user.id) throw new Error('No user');
  const insertObj = { user_id: user.id, content };
  if (audioFileName) insertObj.audio_file = audioFileName;
  if (typeof timestamp === 'number') insertObj.timestamp = timestamp;
  if (meeting_id) insertObj.meeting_id = meeting_id;
  const { error } = await supabase
    .from('notes')
    .insert([insertObj]);
  if (error) throw error;
}

export default saveNoteForUser; 