type DashboardStatsProps = {
  totalApplications: number;
  totalOffers: number;
  successRate: number;
  totalDenials: number;
};

export default function ApplicationAnalyticsDashboard({
  totalApplications,
  totalOffers,
  successRate,
  totalDenials,
}: DashboardStatsProps) {
  const cards = [
    { label: "Total Applications", value: totalApplications },
    { label: "Offers Received", value: totalOffers },
    { label: "Success Rate", value: `${successRate}%` },
    { label: "Denials", value: totalDenials },
  ];

  return (
    <section>
      <h3 className="text-center font-bold">Application Analytics Dashboard</h3>

      <div
        className="
        backdrop-blur-[20px]
        bg-white/5
        border border-white/20
        rounded-2xl
        p-8
        my-4
        shadow-[0_8px_32px_rgba(0,0,0,0.1)]
        "
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
          {cards.map(({ label, value }) => (
            <div
              key={label}
              className="
                    bg-white/10
                    p-6
                    rounded-xl
                    text-center
                    backdrop-blur-[10px]
                    border border-white/20
                    transition-all duration-300 ease-in-out
                    hover:bg-white/15
                    hover:-translate-y-0.5
                "
            >
              <div className="text-2xl font-bold text-white/95 mb-2">
                {value}
              </div>
              <div className="text-sm text-white/70">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
