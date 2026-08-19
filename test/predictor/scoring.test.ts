import { describe, expect, it } from 'vitest';
import {
   heuristicScore,
   median,
   stddev,
} from '../../src/trips/predictor/scoring';
import {
   circularDiffMin,
   minutesOfDayUZT,
   uztDateString,
   uztDayRangeUTC,
} from '../../src/trips/predictor/timeUZT';

describe('predictor / scoring helpers', () => {
   it('median: odd and even', () => {
      expect(median([480])).toBe(480);
      expect(median([470, 480, 490])).toBe(480);
      expect(median([470, 490])).toBe(480);
      expect(median([])).toBe(0);
   });

   it('stddev: single sample = 0, spread grows', () => {
      expect(stddev([480])).toBe(0);
      expect(stddev([])).toBe(0);
      expect(stddev([480, 480, 480])).toBe(0);
      expect(stddev([420, 540])).toBeCloseTo(60, 5);
   });
});

describe('predictor / heuristicScore', () => {
   it('perfect regular driver → confidence 1.0', () => {
      const c = heuristicScore({
         windowOccurrences: 7,
         daysSinceLastSeen: 0,
         recentDepartureMin: [480, 480, 480, 480],
      });
      expect(c).toBe(1);
   });

   it('3-of-7 fresh & consistent → above threshold 0.5', () => {
      const c = heuristicScore({
         windowOccurrences: 3,
         daysSinceLastSeen: 0,
         recentDepartureMin: [480, 485, 475],
      });
      expect(c).toBeGreaterThanOrEqual(0.5);
   });

   it('stale & rare driver → below threshold', () => {
      const c = heuristicScore({
         windowOccurrences: 1,
         daysSinceLastSeen: 30,
         recentDepartureMin: [480],
      });
      expect(c).toBeLessThan(0.5);
   });

   it('noisy departure time kills consistency term', () => {
      const c = heuristicScore({
         windowOccurrences: 7,
         daysSinceLastSeen: 0,
         recentDepartureMin: [420, 540], // stddev = 60 → consistency 0
      });
      // freq(1)*0.4 + recency(1)*0.4 + consistency(0)*0.2 = 0.8
      expect(c).toBeCloseTo(0.8, 3);
   });

   it('matchByTime=false neutralizes consistency (varied times still count)', () => {
      const c = heuristicScore({
         windowOccurrences: 2,
         daysSinceLastSeen: 0,
         recentDepartureMin: [420, 1200], // огромный разброс времени
         matchByTime: false,
      });
      // consistency форсится в 1: 0.4*(2/7) + 0.4*1 + 0.2*1 = 0.714
      expect(c).toBeCloseTo(0.714, 2);
   });

   it('stays within [0,1]', () => {
      const c = heuristicScore({
         windowOccurrences: 999,
         daysSinceLastSeen: -5,
         recentDepartureMin: [],
      });
      expect(c).toBeLessThanOrEqual(1);
      expect(c).toBeGreaterThanOrEqual(0);
   });
});

describe('predictor / timeUZT', () => {
   it('circularDiffMin handles midnight wrap', () => {
      expect(circularDiffMin(480, 500)).toBe(20);
      expect(circularDiffMin(1430, 10)).toBe(20); // 23:50 vs 00:10
      expect(circularDiffMin(0, 720)).toBe(720);
   });

   it('minutesOfDayUZT: 03:00 UTC = 08:00 UZT = 480', () => {
      const d = new Date(Date.UTC(2026, 6, 8, 3, 0, 0));
      expect(minutesOfDayUZT(d)).toBe(480);
   });

   it('minutesOfDayUZT wraps past midnight UZT', () => {
      // 20:00 UTC + 5h = 01:00 UZT = 60 минут
      const d = new Date(Date.UTC(2026, 6, 8, 20, 0, 0));
      expect(minutesOfDayUZT(d)).toBe(60);
   });

   it('uztDateString rolls to next UZT day near midnight', () => {
      const d = new Date(Date.UTC(2026, 6, 8, 20, 0, 0)); // 01:00 UZT 9-го
      expect(uztDateString(d)).toBe('2026-07-09');
   });

   it('uztDayRangeUTC brackets the UZT calendar day', () => {
      const d = new Date(Date.UTC(2026, 6, 8, 20, 0, 0)); // UZT-день 9-го
      const { start, end } = uztDayRangeUTC(d);
      // 00:00 UZT 9-го = 19:00 UTC 8-го
      expect(start.toISOString()).toBe('2026-07-08T19:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-09T19:00:00.000Z');
      expect(d >= start && d < end).toBe(true);
   });
});
