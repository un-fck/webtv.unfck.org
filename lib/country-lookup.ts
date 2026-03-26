let countryCache: Map<string, string> | null = null;

export async function getCountryName(iso3Code: string): Promise<string | null> {
  if (!countryCache) {
    await loadCountryData();
  }

  return countryCache?.get(iso3Code.toUpperCase()) || null;
}

async function loadCountryData() {
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/UN-CRAFd/crafd-reference-datasets/refs/heads/main/data/output/full_country_list_with_stats.csv",
    );
    const csvText = await response.text();

    countryCache = new Map();

    // Parse CSV (skip header row)
    const lines = csvText.trim().split("\n").slice(1);

    for (const line of lines) {
      // Simple CSV parsing (handles quoted fields)
      const match = line.match(/^([^,]+),/);
      if (!match) continue;

      const country = match[1].trim();

      // Extract ISO alpha-3 code (10th column, index 9)
      const columns = line.split(",");
      if (columns.length >= 10) {
        const iso3 = columns[9].trim();
        if (iso3 && iso3 !== "iso_alpha3_code") {
          countryCache.set(iso3, country);
        }
      }
    }

    console.log(`Loaded ${countryCache.size} country mappings`);
  } catch (error) {
    console.error("Failed to load country data:", error);
    countryCache = new Map(); // Empty map to prevent repeated failures
  }
}
