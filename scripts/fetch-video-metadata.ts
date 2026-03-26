#!/usr/bin/env tsx
import { getScheduleVideos } from "../lib/un-api";
import fs from "fs/promises";

getScheduleVideos(365)
  .then((data) => JSON.stringify(data, null, 2))
  .then((json) => fs.writeFile("analysis/video-metadata.json", json))
  .then(() => {
    console.log("Video metadata saved to video-metadata.json");
  })
  .catch((err) => {
    console.error("Error fetching video metadata:", err);
  });
