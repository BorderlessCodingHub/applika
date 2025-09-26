import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type MonthlyData = {
  month: string;
  count: number;
};

type ApplicationTrendCardProps = {
  monthlyData: MonthlyData[];
};

export default function ApplicationTrendCard({ monthlyData }: ApplicationTrendCardProps) {
  const data = {
    labels: monthlyData.map(item => item.month),
    datasets: [
      {
        label: 'Applications',
        data: monthlyData.map(item => item.count),
        borderColor: 'rgba(19,236,171,1)',
        backgroundColor: 'rgba(19,236,171,0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        pointBackgroundColor: 'rgba(19,236,171,1)',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6
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
        ticks: {
          color: 'rgba(255,255,255,0.8)',
          stepSize: 1
        },
        grid: { color: 'rgba(255,255,255,0.1)' }
      },
      x: {
        ticks: { color: 'rgba(255,255,255,0.8)' },
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
      w-full
    ">
      {/* Card Header */}
      <div className="mb-6 border-b border-white/10 pb-4">
        <h3 className="text-white/90 flex items-center gap-2 text-[1.1rem] m-0">
          <i className="fa-solid fa-chart-area"></i>
          Application Trend (Last 30 Days)
        </h3>
      </div>

      {/* Chart Container */}
      <div className="relative h-[300px]">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
