import { supabase } from '../supabaseClient';
import { uploadAudioFile } from './uploadAudioToSupabase';

export async function saveMeetingForUser(user, meetingData, audioFile) {
  let audio_url = null;
  if (audioFile) {
    audio_url = await uploadAudioFile(user.id, audioFile);
  }

  const { error } = await supabase.from('meetings').insert([{
    user_id: user.id,
    title: meetingData.title,
    date: meetingData.date,
    attendees: meetingData.attendees,
    agenda: meetingData.agenda,
    transcript: meetingData.transcript,
    summary: meetingData.summary,
    action_items: meetingData.action_items,
    minutes: meetingData.minutes,
    sentiment: meetingData.sentiment,
    score: meetingData.score,
    audio_url,
  }]);

  if (error) throw error;
} 