export type PublicSocialProfileSource = {
  platform: string;
  provider: string;
  username: string | null;
  displayName: string | null;
  profileUrl: string;
  bio: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  profileImageUrl: string | null;
};

export function toPublicSocialProfile(profile: PublicSocialProfileSource | undefined) {
  if (!profile) {
    return null;
  }

  return {
    platform: profile.platform,
    provider: profile.provider,
    username: profile.username,
    displayName: profile.displayName,
    profileUrl: profile.profileUrl,
    bio: profile.bio,
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    postCount: profile.postCount,
    profileImageUrl: profile.profileImageUrl,
  };
}
