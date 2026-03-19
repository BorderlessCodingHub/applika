import React from "react";
import CardSkeleton from "./CardSkeleton";
import FetchError from "./FetchError";

export type FetchStatusProps = {
  isLoading?: boolean;
  error?: any;
};

export function withFetchStatus<T extends object>(
  Component: React.ComponentType<T>,
  errorMessage: string
) {
  return function Wrapper(props: T & FetchStatusProps) {
    const { isLoading, error, ...rest } = props as FetchStatusProps;

    if (isLoading) return <CardSkeleton />;
    if (error)
      return (
        <FetchError
          message={errorMessage}
          retry={() => window.location.reload()}
        />
      );

    return <Component {...(rest as T)} />;
  };
}

export default withFetchStatus;
