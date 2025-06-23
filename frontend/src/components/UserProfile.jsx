import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function UserProfile({ user, onSelectMeeting, onSelectNote }) {
  const [meetings, setMeetings] = useState([]);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!user || !user.id) return;
    async function fetchMeetings() {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      setMeetings(data || []);
    }
    async function fetchNotes() {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setNotes(data || []);
    }
    fetchMeetings();
    fetchNotes();
  }, [user]);

  if (!user || !user.id) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Your Meetings</h2>
      <ul>
        {meetings.map(meeting => (
          <li
            key={meeting.id}
            className="border-b py-2 cursor-pointer hover:bg-gray-100"
            onClick={() => onSelectMeeting(meeting)}
          >
            <div className="font-semibold">{meeting.title}</div>
            <div className="text-sm text-gray-500">{meeting.date}</div>
          </li>
        ))}
      </ul>

      <h2 className="text-2xl font-bold mt-8 mb-4">Your Notes</h2>
      {notes.length === 0 ? (
        <div className="text-gray-500">No notes saved yet.</div>
      ) : (
        <ul>
          {notes.map(note => (
            <li
              key={note.id}
              className="border-b py-2 cursor-pointer hover:bg-gray-100"
              onClick={() => onSelectNote && onSelectNote(note)}
            >
              <div className="whitespace-pre-line">
                {note.content.length > 40
                  ? note.content.slice(0, 40) + '...'
                  : note.content}
              </div>
              {note.created_at && (
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(note.created_at).toLocaleString()}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
} 