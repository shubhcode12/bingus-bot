require("dotenv").config();
const {create,decryptMedia} = require("@open-wa/wa-automate");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const express = require("express");
const sharp = require("sharp");
const axios = require("axios").default;
const translate = require("@iamtraction/google-translate");
const path = require("path");
const removeBgApiKey = process.env.REMOVEBG_API_KEY || "W8EKZ3rHiuZhPX7uAnjMaJT9";
const server = express();
const PORT = parseInt(process.env.PORT) || 3000;
const welcomeText = `
Welcome to Shubh's Bot! Babu kaise help karu apki

Type #help for command list.
`;
const helpText = `commands : 
#convertImageToPDF: write in caption of a image to turn it into pdf

#downloadYtVideo: write a message with youtube link 

#convertYouTube: write a message with youtube link to turn into mp3

#sticker : write in caption of image/video to turn into sticker

#translate: write a english text to turn into marathi lang

#pp: tag a user from group to show the profile picure
`;

create({
    qrTimeout: 0,
    cacheEnabled: false,
}).then((client) => start(client));
server.use(express.static("public"));
server.listen(PORT, () => console.log(`> Listining on http://localhost:${PORT}`));
process.on("exit", () => {
    if (fs.existsSync("./session.data.json")) {
        fs.unlinkSync("./session.data.json");
    }
});

function start(client) {
    client.onMessage(async (message) => {
        if (message.body.startsWith("#hi")) {
            await client.sendText(message.from, welcomeText, message.id);
            console.log("hi");
        } else if (message.body.startsWith("#help")) {
            await client.reply(message.from, helpText, message.id);
        } else if (message.body.startsWith("#downloadYtVideo ")) {
            const url = message.body.split(" ")[1];
            if (ytdl.validateURL(url)) {
                try {
                    const fileName = `youtube-video-${Date.now()}.mp4`;
                    const filePath = path.join(__dirname, fileName);
                    await client.sendText(message.from, "Ruko bhai tumhala YT video download krke deta hun");
                    await downloadYouTubeVideo(url, filePath);
                    await client.sendFile(message.from, filePath, fileName, null, message.id);
                    fs.unlinkSync(filePath);
                } catch (error) {
                    console.error(error);
                    await client.reply(message.from, "Error downloading video.", message.id);
                }
            } else {
                await client.reply(message.from, "Invalid YouTube URL.", message.id);
            }
        } else if (message.body === "hello") {
            await client.reply(message.from, "Chup karo bonk kar dunga", message.id);
        } else if (
            ["image", "video"].includes(message.type) && message.caption === "#sticker") {
            await client.sendText(message.from, "wait sticker bana raha hun", message.id);
            const mediaData = await decryptMedia(message);
            const dataUrl = `data:${message.mimetype};base64,${mediaData.toString(
                "base64"
            )}`;
            message.type === "image" && (await client.sendImageAsSticker(message.chatId, dataUrl, {
                stickerMetadata: {
                    author: "Bingus Bot",
                    pack: "Bingus",
                    keepScale: true,
                },
            }));
            message.type === "video" && (await client.sendMp4AsSticker(message.chatId, dataUrl));
        } else if (message.body.startsWith("#convertYouTube ")) {
            const url = message.body.split(" ")[1];
            if (ytdl.validateURL(url)) {
                const fileName = `audio-${Date.now()}.mp3`;
                const filePath = path.join(__dirname, fileName);
                try {
                    await client.sendText(message.from, "Ruko thodq kar rha hun");
                    await downloadYouTubeAudio(url, filePath);
                    await client.sendFile(message.from, filePath, fileName);
                    fs.unlinkSync(filePath); // Clean up the file after sending
                } catch (error) {
                    await client.reply(message.from, "Error converting video.", message.id);
                    console.error(error);
                }
            } else {
                await client.sendText(message.from, "Invalid YouTube URL.");
            }
        } else if (message.body.startsWith("#pp ") && message.mentionedJidList.length > 0) {
            // Get the ID of the first mentioned user
            const taggedUser = message.mentionedJidList[0];
            // Fetch the profile picture
            try {
                const profilePicUrl = await client.getProfilePicFromServer(taggedUser);
                if (profilePicUrl) {
                    // Send the profile picture back to the chat
                    await client.sendImage(message.from, profilePicUrl, "profilePic.jpg", `Here's the profile picture of @${taggedUser}.`);
                } else {
                    // Handle if profile picture is not available
                    await client.sendText(message.from, "The user doesn't have a profile picture or it's not accessible.", message.id);
                }
            } catch (error) {
                console.error("Failed to fetch profile picture:", error);
                await client.sendText(message.from, "Error fetching profile picture.", message.id);
            }
        } else if (message.body.startsWith("#translate ")) {
            const textToTranslate = message.body.slice(11);
            translate(textToTranslate, {
                to: "mr"
            }).then(async (res) => {
                console.log(res.text);
                await client.reply(message.from, res.text, message.id);
            }).catch(async (err) => {
                console.error(err);
                await client.reply(message.from, "Sorry, there was an error in translation.", message.id);
            });
        } else if (message.type === "image" && message.caption === "#removebg") {
            await client.reply(message.from, "Sabakr kro bg remove kr raha hun", message.id);
            try {
                const mediaData = await client.decryptMedia(message);
                console.log("Media decrypted");
                const response = await axios.post("https://api.remove.bg/v1.0/removebg", {
                    image_file_b64: mediaData.toString("base64"),
                    size: "auto",
                }, {
                    headers: {
                        "X-Api-Key": removeBgApiKey
                    },
                    responseType: "arraybuffer",
                });
                console.log("Received response from remove.bg");
                const outputFilePath = "no-bg.png";
                fs.writeFileSync(outputFilePath, response.data);
                console.log("File written to disk");
                await client.sendImage(message.from, outputFilePath, outputFilePath);
                console.log("Image sent to WhatsApp");
                fs.unlinkSync(outputFilePath); // Clean up the file after sending
            } catch (error) {
                console.error("Error removing background:", error);
                await client.reply(message.from, "Failed to remove background from image.", message.id);
            }
        } else if (message.type === "document" && message.caption === "#demo") {
            await client.reply(message.from, "caption in document working", message.id);
        }
    });
}
// youtube url to mp4 video
async function downloadYouTubeVideo(url, outputPath) {
    return new Promise((resolve, reject) => {
        ytdl(url).pipe(fs.createWriteStream(outputPath)).on("finish", resolve).on("error", reject);
    });
}
// convert youtube url to mp3
function downloadYouTubeAudio(url, outputPath) {
    return new Promise((resolve, reject) => {
        const stream = ytdl(url, {
            quality: "highestaudio"
        });
        ffmpeg(stream).audioBitrate(128).toFormat("mp3").save(outputPath).on("end", () => resolve()).on("error", (err) => reject(err));
    });
}
