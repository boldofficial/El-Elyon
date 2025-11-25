import React from "react";

type Props = {
  location?: string;
  locations?: string[];
};

export default function LocationBanner({ location, locations }: Props) {
  const displayLocations = locations || (location ? [location] : []);
  
  if (displayLocations.length === 0) {
    return (
      <div className="w-full bg-gray-100 text-gray-600 text-center py-2 font-semibold shadow">
        No locations assigned
      </div>
    );
  }

  return (
    <div className="w-full bg-blue-100 text-blue-900 text-center py-2 font-semibold shadow">
      {displayLocations.length === 1 
        ? `Location: ${displayLocations[0]}`
        : `Locations: ${displayLocations.join(", ")}`
      }
    </div>
  );
}
