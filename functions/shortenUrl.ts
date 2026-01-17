// Utility function to shorten URLs using TinyURL API
// This is separate to be reusable and testable

export async function shortenUrl(longUrl, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('https://tinyurl.com/api/create.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `url=${encodeURIComponent(longUrl)}`
            });

            if (!response.ok) {
                if (attempt === maxRetries) {
                    console.error(`Failed to shorten URL after ${maxRetries} attempts. Status: ${response.status}`);
                    return null;
                }
                // Retry on failure
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
            }

            const shortUrl = await response.text();
            
            // Validate response is a valid URL
            if (shortUrl.startsWith('https://tinyurl.com/') || shortUrl.startsWith('http://tinyurl.com/')) {
                return shortUrl.trim();
            } else {
                console.error('Invalid short URL response:', shortUrl);
                if (attempt === maxRetries) {
                    return null;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
            }
        } catch (error) {
            console.error(`Attempt ${attempt}/${maxRetries} - URL shortening error:`, error.message);
            if (attempt === maxRetries) {
                return null;
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    return null;
}