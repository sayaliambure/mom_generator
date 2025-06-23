export default function MeetingDetail({ meeting, onBack }) {
  if (!meeting) return null;
  return (
    <div className="p-6">
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
      
    </div>
  );
} 