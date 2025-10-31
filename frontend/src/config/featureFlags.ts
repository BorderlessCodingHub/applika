export const featureFlags = {
  PROFILE_FEATURE_ENABLED: process.env.NEXT_PUBLIC_PROFILE_FEATURE === "true",
  REGISTER_FEATURE_ENABLED: process.env.NEXT_PUBLIC_REGISTER_FEATURE === "true",
};
