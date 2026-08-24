export default function NoTradeEmpty({
  title = 'NO TRADE',
  detail = 'Nothing on this scan has volume plus a directional lean. Sit out or wait for RVOL to show up.',
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="border border-gray-500/30 bg-[#141414] rounded-2xl p-5">
      <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Workstation read</div>
      <div className="text-2xl font-black text-gray-200">{title}</div>
      <p className="text-sm text-gray-400 mt-1">{detail}</p>
    </div>
  );
}
