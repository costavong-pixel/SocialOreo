export type PublicMetricsProfile = {
  username?: string | null;
  displayName?: string | null;
  followerCount?: number | null;
  followingCount?: number | null;
  postCount?: number | null;
  profileImageUrl?: string | null;
};

export type PublicMetricsVideo = {
  id: string;
  url: string;
  caption?: string | null;
  hashtags: string[];
  durationSeconds?: number | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  saveCount?: number | null;
  postedAt?: Date | null;
  thumbnailUrl?: string | null;
  audioName?: string | null;
  transcriptIfAvailable?: string | null;
};

export type PublicReelMetric = {
  id: string;
  url: string;
  caption: string;
  thumbnailUrl?: string | null;
  views: number;
  likes?: number | null;
  comments?: number | null;
  engagementPerView?: number;
  reason: string;
};

export type ReelRecommendation = "KEEP" | "CHANGE" | "STOP";

export type PublicReelEvidence = {
  id: string;
  url: string;
  caption: string;
  thumbnailUrl?: string | null;
  rank?: number;
  views?: number;
  engagementPerView?: number;
  durationSeconds?: number | null;
  postedAt?: Date | null;
  captionWordCount: number;
  hashtagCount: number;
  recommendation: ReelRecommendation;
  evidence: string;
  nextTest: string;
};

export type PerformancePattern = {
  label: string;
  sampleSize: number;
  averageViews: number;
};

export type PostingWindow = PerformancePattern;

export type ViewDistributionBin = {
  minViews: number;
  maxViews: number;
  count: number;
};

export type PostingCalendarDay = {
  isoDate: string;
  label: string;
  count: number;
  totalViews: number;
};

export type PostingHeatmapCell = {
  weekday: string;
  hour: number;
  count: number;
  averageViews?: number;
};

export type PublicPerformancePoint = {
  id: string;
  url: string;
  caption: string;
  views: number;
  engagementPerView: number;
  quadrant: "HIGH_REACH_HIGH_INTERACTION" | "HIGH_REACH_LOWER_INTERACTION" | "LOWER_REACH_HIGH_INTERACTION" | "LOWER_REACH_LOWER_INTERACTION";
};

export type PublicPerformanceMap = {
  medianViews: number;
  medianEngagementPerView: number;
  points: PublicPerformancePoint[];
};

export type TranscriptOpening = {
  id: string;
  url: string;
  caption: string;
  opening: string;
  views?: number;
};

export type ContentIntelligence = {
  transcriptCount: number;
  audioCount: number;
  totalReels: number;
  audioPatterns: PerformancePattern[];
  transcriptOpenings: TranscriptOpening[];
};

export type PublicMetrics = {
  profile?: PublicMetricsProfile | null;
  summary: {
    reelsWithViews: number;
    totalViews?: number;
    medianViews?: number;
    totalLikes?: number;
    totalComments?: number;
    engagementPerView?: number;
    engagementPerFollower?: number;
  };
  topReels: PublicReelMetric[];
  bottomReels: PublicReelMetric[];
  reelEvidence?: PublicReelEvidence[];
  viewDistribution: ViewDistributionBin[];
  postingCalendar: PostingCalendarDay[];
  postingHeatmap: PostingHeatmapCell[];
  performanceMap?: PublicPerformanceMap;
  postingWindows: PostingWindow[];
  durationPatterns: PerformancePattern[];
  captionPatterns: PerformancePattern[];
  hashtagPatterns: PerformancePattern[];
  hookPatterns: PerformancePattern[];
  contentTypePatterns: PerformancePattern[];
  contentIntelligence?: ContentIntelligence;
};

const numberOrUndefined = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function captionExcerpt(caption: string | null | undefined): string {
  const normalized = caption?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized || "No public caption";
}

function engagement(video: PublicMetricsVideo): number | undefined {
  const views = numberOrUndefined(video.viewCount);
  if (!views) return undefined;
  const interactions = [video.likeCount, video.commentCount, video.shareCount, video.saveCount]
    .map(numberOrUndefined)
    .filter((value): value is number => value !== undefined);
  return interactions.length ? interactions.reduce((sum, value) => sum + value, 0) / views : undefined;
}

function reelMetric(video: PublicMetricsVideo, reason: string): PublicReelMetric {
  return {
    id: video.id,
    url: video.url,
    caption: captionExcerpt(video.caption),
    thumbnailUrl: video.thumbnailUrl,
    views: video.viewCount ?? 0,
    likes: numberOrUndefined(video.likeCount),
    comments: numberOrUndefined(video.commentCount),
    engagementPerView: engagement(video),
    reason,
  };
}

function captionWordCount(caption: string | null | undefined): number {
  return caption?.trim().split(/\s+/).filter(Boolean).length ?? 0;
}

function publicReelEvidence(video: PublicMetricsVideo, rank: number | undefined, medianViews: number | undefined): PublicReelEvidence {
  const views = numberOrUndefined(video.viewCount);
  const duration = numberOrUndefined(video.durationSeconds);
  const words = captionWordCount(video.caption);
  const details = [
    duration === undefined ? "Length unavailable" : `${duration} sec`,
    `${words}-word caption`,
    `${video.hashtags.length} hashtag${video.hashtags.length === 1 ? "" : "s"}`,
  ].join(" · ");

  let recommendation: ReelRecommendation = "CHANGE";
  let evidence = `Public views are unavailable. Visible details: ${details}.`;
  let nextTest = "Do not repeat this unchanged. Test a clearer opening while keeping the topic and offer the same.";

  if (views !== undefined && medianViews !== undefined && medianViews > 0) {
    const comparison = `${views.toLocaleString()} public views versus a ${medianViews.toLocaleString()} typical reel in this sample`;
    if (views >= medianViews * 1.25) {
      recommendation = "KEEP";
      evidence = `${comparison}. Visible details: ${details}.`;
      nextTest = "Keep this content direction. Test one fresh first line or topic angle instead of copying this reel exactly.";
    } else if (views <= medianViews * 0.5) {
      recommendation = "STOP";
      evidence = `${comparison}. Visible details: ${details}.`;
      nextTest = "Do not repeat this exact opening and structure. Keep the topic only if you can lead with a clearer problem or payoff.";
    } else {
      evidence = `${comparison}. Visible details: ${details}.`;
      nextTest = "Keep one element, then change the first 3 seconds. Test a stronger promise, question, or before-and-after opening.";
    }
  } else if (views !== undefined) {
    evidence = `${views.toLocaleString()} public views. There is not enough visible view data in this sample to judge it against the other reels. Visible details: ${details}.`;
  }

  return {
    id: video.id,
    url: video.url,
    caption: captionExcerpt(video.caption),
    thumbnailUrl: video.thumbnailUrl,
    rank,
    views,
    engagementPerView: engagement(video),
    durationSeconds: duration,
    postedAt: video.postedAt,
    captionWordCount: words,
    hashtagCount: video.hashtags.length,
    recommendation,
    evidence,
    nextTest,
  };
}

function patterns(videos: PublicMetricsVideo[], bucket: (video: PublicMetricsVideo) => string): PerformancePattern[] {
  const groups = new Map<string, number[]>();
  for (const video of videos) {
    const views = numberOrUndefined(video.viewCount);
    if (views === undefined) continue;
    const key = bucket(video);
    groups.set(key, [...(groups.get(key) ?? []), views]);
  }
  return [...groups.entries()]
    .map(([label, views]) => ({ label, sampleSize: views.length, averageViews: average(views) }))
    .sort((a, b) => b.averageViews - a.averageViews);
}

function hookType(caption: string | null | undefined): string {
  const hook = caption?.split(/\n|[.!]/)[0]?.trim().toLowerCase() ?? "";
  if (/^(how to|here('| i)?s how|watch me|step \d|first)/.test(hook)) return "How-to hooks";
  if (/\?$|^(what|why|how|are|is|do|does|can|should)\b/.test(hook)) return "Question hooks";
  if (/^(\d+|three|five|top|the \d+)/.test(hook)) return "List hooks";
  return "Statement hooks";
}

function contentType(video: PublicMetricsVideo): string {
  const opening = video.caption?.split(/\n|[.!]/)[0]?.trim().toLowerCase() ?? "";
  if (/^(how to|here('| i)?s how|watch me|step \d|first)/.test(opening)) return "Tutorial";
  if (/\?$|^(what|why|how|are|is|do|does|can|should)\b/.test(opening)) return "Question-led";
  if (/^(\d+|three|five|top|the \d+)/.test(opening)) return "List-led";
  if (numberOrUndefined(video.durationSeconds) !== undefined && (video.durationSeconds ?? 0) <= 15) return "Short demonstration";
  return "Statement or story";
}

function publicViewDistribution(views: number[]): ViewDistributionBin[] {
  if (!views.length) return [];
  const minimum = Math.min(...views);
  const maximum = Math.max(...views);
  if (minimum === maximum) return [{ minViews: minimum, maxViews: maximum, count: views.length }];

  const binCount = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(views.length))));
  const width = Math.ceil((maximum - minimum + 1) / binCount);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    minViews: minimum + index * width,
    maxViews: index === binCount - 1 ? maximum : Math.min(maximum, minimum + (index + 1) * width - 1),
    count: 0,
  }));
  for (const value of views) {
    const index = Math.min(bins.length - 1, Math.floor((value - minimum) / width));
    bins[index].count += 1;
  }
  return bins;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function publicPostingCalendar(videos: PublicMetricsVideo[]): PostingCalendarDay[] {
  const posted = videos.filter((video): video is PublicMetricsVideo & { postedAt: Date } => Boolean(video.postedAt));
  if (!posted.length) return [];
  const latest = new Date(Math.max(...posted.map((video) => video.postedAt.getTime())));
  latest.setUTCHours(0, 0, 0, 0);
  const counts = new Map<string, { count: number; totalViews: number }>();
  for (const video of posted) {
    const key = dateKey(video.postedAt);
    const current = counts.get(key) ?? { count: 0, totalViews: 0 };
    current.count += 1;
    current.totalViews += numberOrUndefined(video.viewCount) ?? 0;
    counts.set(key, current);
  }
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(latest);
    date.setUTCDate(latest.getUTCDate() - (41 - index));
    const key = dateKey(date);
    const values = counts.get(key) ?? { count: 0, totalViews: 0 };
    return { isoDate: key, label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date), ...values };
  });
}

function publicPostingHeatmap(videos: PublicMetricsVideo[]): PostingHeatmapCell[] {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const values = new Map<string, number[]>();
  const timestamps = new Set<string>();
  for (const video of videos) {
    if (!video.postedAt) continue;
    const key = `${video.postedAt.getUTCDay()}-${video.postedAt.getUTCHours()}`;
    timestamps.add(key);
    const viewCount = numberOrUndefined(video.viewCount);
    if (viewCount !== undefined) values.set(key, [...(values.get(key) ?? []), viewCount]);
  }
  return weekdays.flatMap((weekday, weekdayIndex) => Array.from({ length: 24 }, (_, hour) => {
    const key = `${weekdayIndex}-${hour}`;
    const cell = values.get(key) ?? [];
    return { weekday, hour, count: cell.length || (timestamps.has(key) ? 1 : 0), averageViews: cell.length ? average(cell) : undefined };
  }));
}

function publicPerformanceMap(videos: PublicMetricsVideo[]): PublicPerformanceMap | undefined {
  const rows = videos.flatMap((video) => {
    const views = numberOrUndefined(video.viewCount);
    const engagementPerView = engagement(video);
    return views === undefined || engagementPerView === undefined
      ? []
      : [{ video, views, engagementPerView }];
  });
  const medianViews = median(rows.map((row) => row.views));
  const medianEngagementPerView = median(rows.map((row) => row.engagementPerView));
  if (medianViews === undefined || medianEngagementPerView === undefined) return undefined;

  return {
    medianViews,
    medianEngagementPerView,
    points: rows
      .map(({ video, views, engagementPerView }) => {
        const highReach = views >= medianViews;
        const highInteraction = engagementPerView >= medianEngagementPerView;
        const quadrant: PublicPerformancePoint["quadrant"] = highReach
          ? highInteraction ? "HIGH_REACH_HIGH_INTERACTION" : "HIGH_REACH_LOWER_INTERACTION"
          : highInteraction ? "LOWER_REACH_HIGH_INTERACTION" : "LOWER_REACH_LOWER_INTERACTION";
        return { id: video.id, url: video.url, caption: captionExcerpt(video.caption), views, engagementPerView, quadrant };
      })
      .sort((a, b) => b.views - a.views),
  };
}

function transcriptOpening(transcript: string): string {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  const firstSentence = normalized.split(/[.!?]/)[0]?.trim() ?? normalized;
  return firstSentence.length > 150 ? `${firstSentence.slice(0, 147)}...` : firstSentence;
}

function weekdayHour(date: Date): string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date);
  const hour = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(date);
  return `${weekday} ${hour}:00 UTC`;
}

export function buildPublicMetrics(profile: PublicMetricsProfile | null | undefined, videos: PublicMetricsVideo[]): PublicMetrics {
  const videosWithViews = videos.filter((video) => numberOrUndefined(video.viewCount) !== undefined);
  const views = videosWithViews.map((video) => video.viewCount as number);
  const likes = videos.map((video) => numberOrUndefined(video.likeCount)).filter((value): value is number => value !== undefined);
  const comments = videos.map((video) => numberOrUndefined(video.commentCount)).filter((value): value is number => value !== undefined);
  const interactions = videosWithViews.flatMap((video) =>
    [video.likeCount, video.commentCount, video.shareCount, video.saveCount]
      .map(numberOrUndefined)
      .filter((value): value is number => value !== undefined),
  );
  const totalInteractions = interactions.reduce((sum, value) => sum + value, 0);
  const totalViews = views.reduce((sum, value) => sum + value, 0);
  const ordered = [...videosWithViews].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  const followerCount = numberOrUndefined(profile?.followerCount);
  const transcriptVideos = videos.filter((video) => Boolean(video.transcriptIfAvailable?.trim()));
  const audioVideos = videos.filter((video) => Boolean(video.audioName?.trim()));

  return {
    profile,
    summary: {
      reelsWithViews: views.length,
      totalViews: views.length ? totalViews : undefined,
      medianViews: median(views),
      totalLikes: likes.length ? likes.reduce((sum, value) => sum + value, 0) : undefined,
      totalComments: comments.length ? comments.reduce((sum, value) => sum + value, 0) : undefined,
      engagementPerView: totalViews && interactions.length ? totalInteractions / totalViews : undefined,
      engagementPerFollower: followerCount && interactions.length ? totalInteractions / followerCount : undefined,
    },
    topReels: ordered.slice(0, 3).map((video) => reelMetric(video, "Highest public views in this audit.")),
    bottomReels: [...ordered].reverse().slice(0, 3).map((video) => reelMetric(video, "Lowest public views in this audit.")),
    reelEvidence: [
      ...ordered.map((video, index) => publicReelEvidence(video, index + 1, median(views))),
      ...videos.filter((video) => numberOrUndefined(video.viewCount) === undefined).map((video) => publicReelEvidence(video, undefined, median(views))),
    ],
    viewDistribution: publicViewDistribution(views),
    postingCalendar: publicPostingCalendar(videos),
    postingHeatmap: publicPostingHeatmap(videos),
    performanceMap: publicPerformanceMap(videos),
    postingWindows: patterns(videos.filter((video) => video.postedAt), (video) => weekdayHour(video.postedAt as Date)).slice(0, 3),
    durationPatterns: patterns(videos, (video) => {
      const duration = numberOrUndefined(video.durationSeconds);
      return duration === undefined ? "Duration unavailable" : duration <= 15 ? "0–15 seconds" : duration <= 45 ? "16–45 seconds" : "46+ seconds";
    }),
    captionPatterns: patterns(videos, (video) => {
      const words = video.caption?.trim().split(/\s+/).filter(Boolean).length ?? 0;
      return words <= 12 ? "0–12 words" : words <= 40 ? "13–40 words" : "41+ words";
    }),
    hashtagPatterns: patterns(videos, (video) => video.hashtags.length === 0 ? "No hashtags" : video.hashtags.length <= 3 ? "1–3 hashtags" : "4+ hashtags"),
    hookPatterns: patterns(videos, (video) => hookType(video.caption)),
    contentTypePatterns: patterns(videos, contentType),
    contentIntelligence: {
      transcriptCount: transcriptVideos.length,
      audioCount: audioVideos.length,
      totalReels: videos.length,
      audioPatterns: patterns(audioVideos, (video) => video.audioName?.trim() || "Audio unavailable").slice(0, 4),
      transcriptOpenings: [...transcriptVideos]
        .sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1))
        .slice(0, 3)
        .map((video) => ({
          id: video.id,
          url: video.url,
          caption: captionExcerpt(video.caption),
          opening: transcriptOpening(video.transcriptIfAvailable ?? ""),
          views: numberOrUndefined(video.viewCount),
        })),
    },
  };
}
