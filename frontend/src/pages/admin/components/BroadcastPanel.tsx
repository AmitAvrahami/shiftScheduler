import { useEffect, useState, useRef } from 'react';
import MaterialIcon from '../../../components/MaterialIcon';
import { notificationApi } from '../../../lib/api';
import type { BroadcastRecipient } from '../../../lib/api';
import type { Toast } from '../types';
import { avatarBg, avatarInitials } from '../utils/avatarUtils';

export function BroadcastCenterPanel({
  recipientCount,
  onToast,
}: {
  recipientCount: number;
  onToast: (t: Toast) => void;
}) {
  const [msg, setMsg] = useState('');
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!broadcastId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await notificationApi.getBroadcastStatus(broadcastId);
        setRecipients(res.recipients);
      } catch {
        // ignore poll errors
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [broadcastId]);

  async function handleSend() {
    if (!msg.trim()) return;
    try {
      const res = await notificationApi.broadcast('הודעה לצוות', msg.trim());
      setBroadcastId(res.broadcastId);
      const statusRes = await notificationApi.getBroadcastStatus(res.broadcastId);
      setRecipients(statusRes.recipients);
      onToast({ message: 'הודעה הופצה לכל הצוות', type: 'success' });
      setMsg('');
    } catch (err) {
      onToast({
        message: err instanceof Error ? err.message : 'שגיאה בשליחת הודעה',
        type: 'error',
      });
    }
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setBroadcastId(null);
    setRecipients([]);
  }

  const readCount = recipients.filter((r) => r.isRead).length;

  return (
    <section className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
          הודעות לצוות
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
          <MaterialIcon name="group" className="text-secondary text-[14px]" />
          <span>{recipientCount} נמענים</span>
        </div>
      </div>

      <div className="flex-1 bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex flex-col">
        {!broadcastId ? (
          <>
            <div className="flex items-center gap-2 mb-sm text-[10px] font-bold text-on-surface-variant uppercase">
              <MaterialIcon name="notifications" className="text-secondary text-[14px]" />
              <span>שידור הודעה חדשה</span>
            </div>

            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="הכנס עדכונים חשובים, הודעות ביקורת, או הוראות כלליות לכל הצוות..."
              className="w-full flex-1 min-h-[120px] rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[rgba(43,53,143,0.1)] focus:border-[#2B358F] transition-all bg-white border border-[#e2e8f0] text-on-surface"
              style={{ direction: 'rtl' }}
            />

            <div className="flex items-center justify-between mt-md">
              <span className="text-xs text-on-surface-variant font-medium opacity-70">
                {msg.length > 0 ? `${msg.length} תווים` : 'תומך Markdown'}
              </span>
              <button
                onClick={handleSend}
                disabled={!msg.trim()}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm ${
                  msg.trim()
                    ? 'bg-[#056AE5] text-white hover:bg-[#0457B8] hover:shadow-md'
                    : 'bg-surface-container text-on-surface-variant/40 cursor-not-allowed'
                }`}
              >
                <MaterialIcon name="send" className="text-[14px]" />
                שלח לכולם
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full">
            <div className="rounded-lg px-4 py-3 mb-md bg-green-50 border border-green-200">
              <div className="flex items-center justify-between mb-sm">
                <div className="flex items-center gap-2">
                  <MaterialIcon name="check" className="text-green-600 text-[16px]" />
                  <span className="text-sm font-bold text-green-800">ההודעה נשלחה!</span>
                </div>
                <span className="text-xs font-bold text-green-700">
                  {readCount}/{recipients.length} קראו
                </span>
              </div>
              <div className="h-2 rounded-full bg-green-100 overflow-hidden">
                <div
                  className="h-full transition-all duration-700 bg-green-500"
                  style={{
                    width: recipients.length ? `${(readCount / recipients.length) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-auto pr-1 mb-md">
              {recipients.map((r, i) => (
                <div
                  key={r.userId}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: avatarBg(i) }}
                  >
                    {avatarInitials(r.name)}
                  </div>
                  <span className="flex-1 text-sm font-medium text-on-surface">{r.name}</span>
                  {r.isRead ? (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">
                      <MaterialIcon name="check" className="text-[10px]" /> נקרא
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant opacity-60 bg-surface-container px-2 py-0.5 rounded border border-outline-variant/20">
                      <MaterialIcon name="schedule" className="text-[10px]" /> ממתין
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-md border-t border-outline-variant/20 mt-auto">
              <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                מתרענן כל 5 שניות
              </div>
              <button
                onClick={handleReset}
                className="text-xs font-bold px-4 py-2 rounded-lg transition-all bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              >
                הודעה חדשה
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
