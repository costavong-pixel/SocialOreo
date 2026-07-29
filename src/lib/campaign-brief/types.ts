import { z } from "zod";

export const campaignGoalOptions = [
  { value: "views", label: "More views" },
  { value: "followers", label: "More followers" },
  { value: "comments", label: "More comments" },
  { value: "dms", label: "More DMs" },
  { value: "website_clicks", label: "Website clicks" },
  { value: "bookings", label: "Bookings" },
  { value: "foot_traffic", label: "Local foot traffic" },
  { value: "sales", label: "More sales" },
  { value: "lead_generation", label: "Lead generation" },
  { value: "authority", label: "Authority / trust" },
] as const;

export const campaignOccasionOptions = [
  { value: "product_launch", label: "Product launch" },
  { value: "holiday_promo", label: "Holiday promo" },
  { value: "restaurant_deal", label: "Restaurant deal" },
  { value: "local_event", label: "Local event" },
  { value: "new_menu_item", label: "New menu item" },
  { value: "personal_brand_growth", label: "Personal brand growth" },
  { value: "competitor_research", label: "Competitor research" },
  { value: "agency_client_campaign", label: "Agency client campaign" },
  { value: "evergreen_content", label: "Evergreen content" },
] as const;

export const campaignNicheOptions = [
  { value: "food", label: "Food & restaurant" },
  { value: "beauty", label: "Beauty" },
  { value: "fitness", label: "Fitness" },
  { value: "real_estate", label: "Real estate" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "coaching", label: "Coaching" },
  { value: "agency", label: "Agency" },
  { value: "local_business", label: "Local business" },
  { value: "other", label: "Other" },
] as const;

export const campaignToneOptions = [
  { value: "funny", label: "Funny" },
  { value: "expert", label: "Expert" },
  { value: "spicy", label: "Spicy" },
  { value: "luxury", label: "Luxury" },
  { value: "simple", label: "Simple" },
  { value: "educational", label: "Educational" },
  { value: "emotional", label: "Emotional" },
  { value: "direct", label: "Direct" },
] as const;

export const campaignBriefSchema = z.object({
  occasion: z.string().min(1, "Select an occasion."),
  goal: z.enum(campaignGoalOptions.map((option) => option.value) as [string, ...string[]]),
  niche: z.string().min(1, "Select a niche."),
  targetAudience: z.string().min(2, "Describe your target audience."),
  offerOrCta: z.string().min(2, "Describe your offer or CTA."),
  tone: z.enum(campaignToneOptions.map((option) => option.value) as [string, ...string[]]),
});

export type CampaignBrief = z.infer<typeof campaignBriefSchema>;
