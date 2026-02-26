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
            if (args.Length < 1) return 1;
            string outputPath = args[0];

            try
            {
                SetProcessDPIAware();
                Screen screen = Screen.PrimaryScreen;
                if (screen == null) return 2;

                using (Bitmap bitmap = new Bitmap(screen.Bounds.Width, screen.Bounds.Height))
                {
                    using (Graphics graphics = Graphics.FromImage(bitmap))
                    {
                        graphics.CopyFromScreen(screen.Bounds.Location, Point.Empty, screen.Bounds.Size);
                        ImageCodecInfo jpegEncoder = ImageCodecInfo.GetImageEncoders().FirstOrDefault(codec => codec.MimeType == "image/jpeg");
                        if (jpegEncoder == null) return 3;

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
                Console.WriteLine("ERROR: " + ex.Message);
                return 4;
            }
        }
    }
}
