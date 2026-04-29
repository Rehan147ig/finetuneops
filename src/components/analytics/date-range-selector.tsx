"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type AnalyticsRange = "7d" | "30d" | "90d";

const ranges: AnalyticsRange[] = ["7d", "30d", "90d"];

type DateRangeSelectorProps = {
  selectedRange: AnalyticsRange;
};

export function DateRangeSelector({ selectedRange }: DateRangeSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="range-selector" role="group" aria-label="Analytics date range">
      {ranges.map((range) => {
        const isActive = range === selectedRange;

        return (
          <button
            key={range}
            type="button"
            className={isActive ? "range-button active" : "range-button"}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("range", range);
              router.push(`${pathname}?${params.toString()}`);
            }}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}
