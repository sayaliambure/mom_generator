import { supabase } from '../supabaseClient';
import { uploadAudioFile } from './uploadAudioToSupabase';

// meetingData: { id, ...fieldsToUpdate }
export async function saveMeetingForUser(user, meetingData, audioFile) {
  let audio_url = null;
  if (audioFile) {
    audio_url = await uploadAudioFile(user.id, audioFile);
  }

  const updateObj = { ...meetingData };
  if (audio_url) updateObj.audio_url = audio_url;
  if (user && user.id) updateObj.user_id = user.id;

  if (meetingData.id) {
    // First, let's check if the meeting actually exists
    const { data: existingMeeting, error: checkError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingData.id);
    
    if (checkError) {
      throw checkError;
    }
    
    if (!existingMeeting || existingMeeting.length === 0) {
      throw new Error(`Meeting not found with ID: ${meetingData.id}`);
    }
    
    // Update only the provided fields for the existing meeting
    const { data, error } = await supabase
      .from('meetings')
      .update(updateObj)
      .eq('id', meetingData.id)
      .select('*');
    
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      throw new Error(`No meeting found with ID: ${meetingData.id}`);
    }
    
    return { id: data[0].id };
  } else {
    // Insert new meeting
    if (!updateObj.id) {
      delete updateObj.id;
    }
    const { data, error } = await supabase
      .from('meetings')
      .insert([updateObj])
      .select('*');
    
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      throw new Error('Failed to create meeting - no data returned');
    }
    
    return { id: data[0].id };
  }
} 