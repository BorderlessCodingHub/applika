"use client";

import React from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";
import { AverageDaysStep } from "@/features/home/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type AverageDaysChartCardProps = {
  averageDaysData: AverageDaysStep[];
};

export default function AverageDaysChartCardClientUI({ averageDaysData }: AverageDaysChartCardProps) {
  const data = {
    labels: averageDaysData.map((item) => item.name),
    datasets: [
      {
        label: "Average Days",
        data: averageDaysData.map((item) => item.average_days),
        backgroundColor: averageDaysData.map((item) => item.color + "80"),
        borderColor: averageDaysData.map((item) => item.color),
        borderWidth: 2,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "rgba(255,255,255,0.8)",
          font: { size: 12 },
        },
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `${context.dataset.label}: ${Math.round(context.parsed.y)} days`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: "rgba(255,255,255,0.8)",
          callback: function (value: any) {
            return Math.round(value) + " days";
          },
        },
        grid: { color: "rgba(255,255,255,0.1)" },
      },
      x: {
        ticks: {
          color: "rgba(255,255,255,0.8)",
          maxRotation: 45,
        },
        grid: { color: "rgba(255,255,255,0.1)" },
      },
    },
  };

  return (
    <div
      className="
        dashboard-card-size
        backdrop-blur-[20px]
        bg-white/5
        border border-white/20
        rounded-2xl
        p-8
        my-4
        shadow-[0_8px_32px_rgba(0,0,0,0.1)]
        min-h-[300px]
      "
    >
      <div className="mb-6 border-b border-white/10 pb-4">
        <h3 className="text-white/90 flex items-center gap-2 text-[1.1rem] m-0">
          <i className="fa-solid fa-clock"></i>
          Average Days Between Steps
        </h3>
      </div>

      <div className="relative h-[300px]">
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
