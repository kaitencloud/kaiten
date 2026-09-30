type TabPathMatcher = {
  suffix: string;
  value: string;
};

export const getActiveTabFromPathname = ({
  defaultTab,
  matchers,
  pathname,
  basePath,
}: {
  defaultTab: string;
  matchers: TabPathMatcher[];
  pathname: string;
  basePath?: string;
}) => {
  if (basePath) {
    const pathToCheck = pathname.startsWith(basePath)
      ? pathname.slice(basePath.length)
      : '';

    for (const matcher of matchers) {
      if (
        pathToCheck === matcher.suffix ||
        pathToCheck.startsWith(matcher.suffix + '/')
      ) {
        return matcher.value;
      }
    }
  } else {
    for (const matcher of matchers) {
      if (pathname.endsWith(matcher.suffix)) {
        return matcher.value;
      }
    }
  }

  return defaultTab;
};
