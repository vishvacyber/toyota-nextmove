import type { Model } from "@nextmove/contracts";

/** Official Toyota imagery from toyota.com's own image servers (Toyota is the event sponsor and permits its use):
 * a studio shot of each model on a transparent background, and a lifestyle photo for full-screen moments. If Toyota's
 * server ever refuses an image, CarPhoto falls back to a freely licensed Wikimedia Commons photo of the model. */
export type CarImage = { name: string; studio: string; hero?: string; fallback: string };

export const PHOTOS: Record<Model, CarImage> = {
  Camry: {
    name: "Toyota Camry",
    studio: "https://delivery.tcom.assetscs.toyota.com/adobe/assets/urn:aaid:aem:fc38cc08-6250-4321-99a9-791b6aab4f9b/as/MY27_Camry_US_Nightshade-Hybrid-4WD_2551_03U5_03_6K.png",
    hero: "https://delivery.tcom.assetscs.toyota.com/adobe/assets/urn:aaid:aem:289febdc-9fc5-421d-8085-692e7ff0f07a/as/CAM_MY25_0028_V001.png",
    fallback: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Toyota_Camry_%28XV80%29_Washington_DC_Metro_Area%2C_USA.jpg/1280px-Toyota_Camry_%28XV80%29_Washington_DC_Metro_Area%2C_USA.jpg",
  },
  RAV4: {
    name: "Toyota RAV4",
    studio: "https://tmna.aemassets.toyota.com/is/image/toyota/toyota/jellies/relative/2026/rav4/base.png",
    hero: "https://tmna.aemassets.toyota.com/is/image/toyota/toyota/vehicles/2026/rav4/mlp/welcomemat/TYTW3292000H_desktop.png",
    fallback: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/Toyota_RAV4_Hybrid_%28XA50%29_DSC_2709_%28cropped%29.jpg/1280px-Toyota_RAV4_Hybrid_%28XA50%29_DSC_2709_%28cropped%29.jpg",
  },
  Tacoma: {
    name: "Toyota Tacoma",
    studio: "https://tmna.aemassets.toyota.com/is/image/toyota/toyota/jellies/relative/2026/tacoma/base.png",
    fallback: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Toyota_Tacoma_TRD_Off_Road_%28N400%29_IMG_9727_%28cropped%29.jpg/1280px-Toyota_Tacoma_TRD_Off_Road_%28N400%29_IMG_9727_%28cropped%29.jpg",
  },
  Highlander: {
    name: "Toyota Highlander",
    studio: "https://tmna.aemassets.toyota.com/is/image/toyota/toyota/jellies/relative/2026/highlander/base.png",
    hero: "https://tmna.aemassets.toyota.com/is/image/toyota/toyota/vehicles/2026/highlander/mlp/welcome-mat/HLD_MY25_0010_V001_desktop.png",
    fallback: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/88/Toyota_Highlander_Hybrid_%28XU70%29_1X7A0197.jpg/1280px-Toyota_Highlander_Hybrid_%28XU70%29_1X7A0197.jpg",
  },
  Prius: {
    name: "Toyota Prius",
    studio: "https://delivery.tcom.assetscs.toyota.com/adobe/assets/urn:aaid:aem:9981bb1f-7b7d-4c20-9696-86d896f0c3cc/as/MY27_Prius_US_Limited-AWD_1268_01L0_03_6K.png",
    hero: "https://delivery.tcom.assetscs.toyota.com/adobe/assets/urn:aaid:aem:6fd1df88-dec1-4bce-8715-d19736ca1002/as/Prius-16x9-without-super.png",
    fallback: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/2023_Toyota_Prius_Z_HEV.jpg/1280px-2023_Toyota_Prius_Z_HEV.jpg",
  },
  bZ: {
    name: "Toyota bZ4X",
    studio: "https://delivery.tcom.assetscs.toyota.com/adobe/assets/urn:aaid:aem:7e1fbc1b-714e-491f-8c12-8e07cb48b525/as/MY27_BZ_US_Limited-AWD_2882_0089_03_6K.png",
    hero: "https://delivery.tcom.assetscs.toyota.com/adobe/assets/urn:aaid:aem:faf509f1-45c7-425d-a982-114b8704e0e4/as/BZE_MY26_0008_V002.png",
    fallback: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1f/2025_Toyota_bZ4X_Z_4WD.jpg/1280px-2025_Toyota_bZ4X_Z_4WD.jpg",
  },
};

export const MODELS = Object.keys(PHOTOS) as Model[];
/** Models with a lifestyle photo, for the attract screen. */
export const HERO_MODELS = MODELS.filter((m) => PHOTOS[m].hero);

/** Ask Toyota's image servers for a right-sized copy (both CDNs resize on the fly). */
export const sized = (url: string, width: number, alpha = false) =>
  url.includes("assetscs.toyota.com") ? `${url}?format=webp&quality=85&width=${width}`
    : `${url}?wid=${width}&fmt=${alpha ? "png-alpha" : "jpeg"}&qlt=85`;
