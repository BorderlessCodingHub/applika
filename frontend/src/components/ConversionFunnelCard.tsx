import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type ConversionData = {
  name: string;
  rate: number;
  color: string;
};

type ConversionFunnelCardProps = {
  conversionData: ConversionData[];
};

export default function ConversionFunnelCard({ conversionData }: ConversionFunnelCardProps) {
  const data = {
    labels: conversionData.map(item => item.name),
    datasets: [
      {
        label: 'Reach Rate (%)',
        data: conversionData.map(item => item.rate),
        backgroundColor: conversionData.map(item => item.color + '80'), // 50% opacity
        borderColor: conversionData.map(item => item.color),
        borderWidth: 2,
        borderRadius: 4
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: 'rgba(255,255,255,0.8)',
          font: { size: 12 }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: 'rgba(255,255,255,0.8)',
          callback: function(value: any) {
            return value + '%';
          }
        },
        grid: { color: 'rgba(255,255,255,0.1)' }
      },
      x: {
        ticks: {
          color: 'rgba(255,255,255,0.8)',
          maxRotation: 45
        },
        grid: { color: 'rgba(255,255,255,0.1)' }
      }
    }
  };

  return (
    <div className="
      backdrop-blur-[20px]
      bg-white/5
      border border-white/20
      rounded-2xl
      p-8
      my-4
      shadow-[0_8px_32px_rgba(0,0,0,0.1)]
      min-h-[300px]
    ">
      {/* Card Header */}
      <div className="mb-6 border-b border-white/10 pb-4">
        <h3 className="text-white/90 flex items-center gap-2 text-[1.1rem] m-0">
          <i className="fa-solid fa-chart-bar"></i>
          Conversion Funnel
        </h3>
      </div>

      {/* Chart Container */}
      <div className="relative h-[300px]">
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
