import type { Model } from "@nextmove/contracts";

/** Real photos of each model, freely licensed on Wikimedia Commons (CC BY / CC BY-SA / CC0). Loaded from Wikimedia's
 * servers, never copied into the repo, and always shown with author + license (CarPhoto). */
export type CarPhoto = { src: string; alt: string; author: string; license: string; licenseUrl: string; page: string };

export const PHOTOS: Record<Model, CarPhoto> = {
  Camry: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Toyota_Camry_%28XV80%29_Washington_DC_Metro_Area%2C_USA.jpg/1280px-Toyota_Camry_%28XV80%29_Washington_DC_Metro_Area%2C_USA.jpg",
    alt: "Toyota Camry, exterior photo",
    author: "OWS Photography",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    page: "https://commons.wikimedia.org/wiki/File:Toyota_Camry_(XV80)_Washington_DC_Metro_Area,_USA.jpg",
  },
  RAV4: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/Toyota_RAV4_Hybrid_%28XA50%29_DSC_2709_%28cropped%29.jpg/1280px-Toyota_RAV4_Hybrid_%28XA50%29_DSC_2709_%28cropped%29.jpg",
    alt: "Toyota RAV4, exterior photo",
    author: "Alexander Migl",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    page: "https://commons.wikimedia.org/wiki/File:Toyota_RAV4_Hybrid_(XA50)_DSC_2709_(cropped).jpg",
  },
  Tacoma: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Toyota_Tacoma_TRD_Off_Road_%28N400%29_IMG_9727_%28cropped%29.jpg/1280px-Toyota_Tacoma_TRD_Off_Road_%28N400%29_IMG_9727_%28cropped%29.jpg",
    alt: "Toyota Tacoma, exterior photo",
    author: "Alexander-93",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    page: "https://commons.wikimedia.org/wiki/File:Toyota_Tacoma_TRD_Off_Road_(N400)_IMG_9727_(cropped).jpg",
  },
  Highlander: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/88/Toyota_Highlander_Hybrid_%28XU70%29_1X7A0197.jpg/1280px-Toyota_Highlander_Hybrid_%28XU70%29_1X7A0197.jpg",
    alt: "Toyota Highlander, exterior photo",
    author: "Alexander Migl",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    page: "https://commons.wikimedia.org/wiki/File:Toyota_Highlander_Hybrid_(XU70)_1X7A0197.jpg",
  },
  Prius: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/2023_Toyota_Prius_Z_HEV.jpg/1280px-2023_Toyota_Prius_Z_HEV.jpg",
    alt: "Toyota Prius, exterior photo",
    author: "TTTNIS",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
    page: "https://commons.wikimedia.org/wiki/File:2023_Toyota_Prius_Z_HEV.jpg",
  },
  bZ: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1f/2025_Toyota_bZ4X_Z_4WD.jpg/1280px-2025_Toyota_bZ4X_Z_4WD.jpg",
    alt: "Toyota bZ4X, exterior photo",
    author: "TTTNIS",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
    page: "https://commons.wikimedia.org/wiki/File:2025_Toyota_bZ4X_Z_4WD.jpg",
  },
};

export const MODELS = Object.keys(PHOTOS) as Model[];
