import MaterialIcon from './MaterialIcon';

interface SuccessOverlayProps {
  onClose: () => void;
}

export default function SuccessOverlay({ onClose }: SuccessOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-white/90 backdrop-blur-[2px] animate-in fade-in duration-300"
      dir="rtl"
    >
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
        {/* Success Icon */}
        <div className="relative mb-4">
          <div className="w-24 h-24 bg-[#176FEA] rounded-full flex items-center justify-center shadow-[0px_4px_6px_-4px_rgba(0,0,0,0.10),0px_10px_15px_-3px_rgba(0,0,0,0.10),0px_0px_0px_4px_#D8E2FF]">
            <MaterialIcon name="check" className="text-white text-5xl font-bold" />
          </div>
        </div>

        {/* Message */}
        <div className="flex flex-col gap-2">
          <h2 className="text-[#1B1B21] text-xl font-normal leading-normal font-['Liberation Sans']">
            האילוצים נשמרו בהצלחה
          </h2>
          <p className="text-[#454652] text-base font-normal leading-normal font-['Liberation Sans']">
            האילוצים שלך עבור השבוע הקרוב עודכנו ונשמרו במערכת.
          </p>
        </div>

        {/* Button */}
        <div className="w-full pt-3">
          <button
            onClick={onClose}
            className="w-full h-12 bg-[#000654] hover:opacity-90 text-white font-bold rounded-full transition-all shadow-[0px_2px_4px_-2px_rgba(0,0,0,0.10),0px_4px_6px_-1px_rgba(0,0,0,0.10)] flex items-center justify-center gap-2"
          >
            <span className="font-['Arimo Hebrew Subset'] text-base">צפה באילוצים</span>
          </button>
        </div>
      </div>
    </div>
  );
}
