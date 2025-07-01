import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function MeetingDetail({ meeting, onBack, onDelete }) {
  const [meetingNotes, setMeetingNotes] = useState([]);

  useEffect(() => {
    async function fetchNotes() {
      if (!meeting?.id) return;
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('meeting_id', meeting.id)
        .order('timestamp', { ascending: true });
      if (!error) setMeetingNotes(data || []);
    }
    fetchNotes();
  }, [meeting?.id]);

  if (!meeting) return null;
  return (
    <div className="p-6 relative">
      {onDelete && (
        <button
          onClick={() => onDelete(meeting)}
          // className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded shadow"
          className="absolute top-6 right-8 mb-4 text-red-500 underline"
        >
          Delete
        </button>
      )}
      <button onClick={onBack} className="mb-4 text-blue-600 underline">Back to meetings</button>
      <h2 className="text-2xl font-bold mb-2">{meeting.title}</h2>
      <div className="mb-2 text-gray-600">{meeting.date}</div>
      {meeting.audio_url && (
        <div className="mb-2">
          <strong>Recording:</strong>
          <audio controls src={meeting.audio_url} className="w-full" />
        </div>
      )}
      <div className="mb-2"><strong>Attendees:</strong> {meeting.attendees}</div>
      <div className="mb-2"><strong>Agenda:</strong> {meeting.agenda}</div>
      <div className="mb-2"><strong>Transcript:</strong>
        <pre className="bg-gray-100 p-2 rounded">{meeting.transcript}</pre>
      </div>
      <div className="mb-2"><strong>Summary:</strong>
        <pre className="bg-gray-100 p-2 rounded">{meeting.summary}</pre>
      </div>
      <div className="mb-2"><strong>Action Items:</strong>
        <pre className="bg-gray-100 p-2 rounded">{meeting.action_items}</pre>
      </div>
      <div className="mb-2"><strong>Minutes:</strong>
        <pre className="bg-gray-100 p-2 rounded">{meeting.minutes}</pre>
      </div>
      <div className="mb-2"><strong>Sentiment:</strong> {meeting.sentiment}</div>
      <div className="mb-2"><strong>Score:</strong> {meeting.score}</div>
      {meetingNotes.length > 0 && (
        <div className="mt-6 bg-gray-50 p-4 border rounded">
          <h2 className="text-xl font-semibold mb-2">Meeting Notes</h2>
          <ul>
            {meetingNotes.map((note, idx) => (
              <li key={note.id || idx} className="mb-2">
                <span className="text-xs text-gray-500 mr-2">
                  {typeof note.timestamp === 'number' && !isNaN(note.timestamp) ? `${note.timestamp.toFixed(1)}s:` : ''}
                </span>
                <span>{note.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
} 