import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const capitalizeFromLowerCase = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const capitalizeFromUpperCase = (str: string) => {
  const result = str.toLowerCase();
  return capitalizeFromLowerCase(result);
};
