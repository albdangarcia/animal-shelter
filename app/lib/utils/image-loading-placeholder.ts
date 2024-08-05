// Function to generate a shimmer effect SVG
export const shimmer = (w: number, h: number) => `
<svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <!-- Define a linear gradient with three stops for the shimmer effect -->
    <linearGradient id="g">
      <stop stop-color="#cecece" offset="20%" />
      <stop stop-color="#e6e6e6" offset="50%" />
      <stop stop-color="#cecece" offset="70%" />
    </linearGradient>
  </defs>
  <!-- Background rectangle with a solid color -->
  <rect width="${w}" height="${h}" fill="#cecece" />
  <!-- Foreground rectangle with the linear gradient applied -->
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
  <!-- Animation to move the gradient horizontally across the rectangle -->
  <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1s" repeatCount="indefinite"  />
</svg>`;

// Function to convert a string to a base64-encoded string
export const toBase64 = (str: string) =>
  // Check if the code is running on the server (Node.js)
  typeof window === "undefined"
    // Use Buffer to convert the string to base64 on the server
    ? Buffer.from(str).toString("base64")
    // Use window.btoa to convert the string to base64 in the browser
    : window.btoa(str);