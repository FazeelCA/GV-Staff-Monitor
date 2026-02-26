using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace GVCapture
{
    class Program
    {
        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

        static int Main(string[] args)
        {
            if (args.Length < 1)
            {
                Console.WriteLine("Usage: gv_capture.exe <output_path>");
                return 1;
            }

            string outputPath = args[0];

            try
            {
                // Force Per-Monitor DPI awareness to ensure we get physical pixels, not logical scaled pixels.
                // This prevents the image from being cropped.
                SetProcessDPIAware();

                Screen screen = Screen.PrimaryScreen;
                if (screen == null)
                {
                    Console.WriteLine("No primary screen detected.");
                    return 2;
                }

                // Create a bitmap with the physical dimensions of the primary screen
                using (Bitmap bitmap = new Bitmap(screen.Bounds.Width, screen.Bounds.Height))
                {
                    using (Graphics graphics = Graphics.FromImage(bitmap))
                    {
                        // Extract pixels specifically from the primary monitor logical location
                        graphics.CopyFromScreen(screen.Bounds.Location, Point.Empty, screen.Bounds.Size);

                        // Isolate the JPEG encoder
                        ImageCodecInfo jpegEncoder = ImageCodecInfo.GetImageEncoders()
                            .FirstOrDefault(codec => codec.MimeType == "image/jpeg");

                        if (jpegEncoder == null)
                        {
                            Console.WriteLine("JPEG encoder not found.");
                            return 3;
                        }

                        // Configure 40-quality JPEG compression exactly as in v0.4.1
                        using (EncoderParameters encoderParams = new EncoderParameters(1))
                        {
                            encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 40L);
                            bitmap.Save(outputPath, jpegEncoder, encoderParams);
                        }
                    }
                }

                Console.WriteLine("SUCCESS");
                return 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ERROR: {ex.Message}");
                return 4;
            }
        }
    }
}
