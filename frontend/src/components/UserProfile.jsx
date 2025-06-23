import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function UserProfile({ user, onSelectMeeting }) {
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    if (!user || !user.id) return;
    console.log('Fetching meetings for user:', user?.id);
    async function fetchMeetings() {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      console.log('Fetched meetings:', data, 'Error:', error);
      setMeetings(data || []);
    }
    fetchMeetings();
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
    </div>
  );
} 