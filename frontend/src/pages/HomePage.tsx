const dateFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  dateStyle: 'full',
  timeStyle: 'short',
});

function HomePage() {
  const now = dateFormatter.format(new Date());

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-md p-10 text-center">
        <h1 className="text-4xl font-bold text-blue-700 mb-4">מערכת ניהול משמרות</h1>
        <p className="text-gray-600 text-lg mb-6">
          ברוכים הבאים למערכת לניהול לוחות זמנים ומשמרות עובדים.
        </p>
        <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-medium">תאריך ושעה (ירושלים):</p>
          <p className="mt-1">{now}</p>
        </div>
        <p className="mt-8 text-xs text-gray-400">ShiftScheduler v0.1 — בפיתוח</p>
      </div>
    </main>
  );
}

export default HomePage;
