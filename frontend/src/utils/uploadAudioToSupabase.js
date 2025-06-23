import { supabase } from '../supabaseClient';

export async function uploadAudioFile(userId, file) {
  if (!userId) throw new Error('User ID is missing for audio upload');
  if (!file || !file.name) throw new Error('No valid file to upload');
  if (!(file instanceof File || file instanceof Blob)) throw new Error('File is not a valid File or Blob');
  if (file.size === 0) throw new Error('File is empty');
  if (file.size > 50 * 1024 * 1024) throw new Error('File is too large for Supabase free tier (50MB limit)');

  const fileExt = file.name.split('.').pop();
  const filePath = `${userId}/${Date.now()}.${fileExt}`;
  console.log('Uploading file:', file, 'filePath:', filePath);

console.log('ID', userId);

  const { data, error } = await supabase.storage
    .from('meeting-audios')
    .upload(filePath, file,{
    upsert: false, // or true if you want to allow overwrites
  });

  if (error) throw error;

  // Get public URL
  const { data: publicUrlData } = supabase
    .storage
    .from('meeting-audios')
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
} 