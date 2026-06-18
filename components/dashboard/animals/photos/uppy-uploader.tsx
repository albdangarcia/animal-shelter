"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/react/dashboard";
import XHRUpload from "@uppy/xhr-upload";
import "@/node_modules/@uppy/core/dist/style.min.css";
import "@/node_modules/@uppy/dashboard/dist/style.min.css";
import { toast } from "sonner";

interface UppyUploaderProps {
  animalId: string;
  canManage: boolean;
}
interface UploadResponse {
  body?: {
    url?: string;
  };
}

const UploadDisabledPlaceholder = () => {
  return (
    <div className="disabledUploader-root">
      <div className="disabledUploader-inner">
        <div className="disabledUploader-hint">
          <div className="disabledUploader-icon">
            <Lock size={22} strokeWidth={2} />
          </div>
          <span className="disabledUploader-title">Uploading is disabled</span>
          <span className="disabledUploader-subtext">
            You don&apos;t have permission to upload images
          </span>
        </div>
      </div>

      <style jsx>{`
        .disabledUploader-root {
          width: 100%;
        }

        .disabledUploader-inner {
          position: relative;
          width: 100%;
          height: 250px;
          background-color: #f3f3f3;
          border-radius: 8px;
          overflow: hidden;
          cursor: not-allowed;
        }

        /* Diagonal hatch pattern reads as "blocked/inactive" at a glance,
           same language as disabled form fields and OS-level drop targets. */
        .disabledUploader-inner {
          background-image: repeating-linear-gradient(
            -45deg,
            #ebebeb 0px,
            #ebebeb 8px,
            #f3f3f3 8px,
            #f3f3f3 16px
          );
        }

        .disabledUploader-inner::before {
          content: "";
          position: absolute;
          inset: 8px;
          border: 2px dotted #c7c7c7;
          border-radius: 5px;
          pointer-events: none;
        }

        .disabledUploader-hint {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          height: 100%;
          padding: 0 24px;
          text-align: center;
        }

        .disabledUploader-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background-color: #e2e2e2;
          color: #8a8a8a;
          margin-bottom: 6px;
        }

        .disabledUploader-title {
          color: #8a8a8a;
          font-size: 16px;
          font-weight: 600;
        }

        .disabledUploader-subtext {
          color: #8a8a8a;
          font-size: 13px;
          font-weight: 400;
          max-width: 320px;
        }
      `}</style>
    </div>
  );
};

const UppyUploader = ({ animalId, canManage }: UppyUploaderProps) => {
  const router = useRouter();

  const [uppy] = useState(() =>
    new Uppy({
      debug: true,
      autoProceed: true,
    }).use(XHRUpload, {
      endpoint: "/api/upload-to-blob",
      formData: true,
      fieldName: "file",
      allowedMetaFields: ["animalId"],
    }),
  );

  useEffect(() => {
    uppy.setMeta({ animalId });

    const handleUploadSuccess = (file: unknown, response: unknown) => {
      const res = response as UploadResponse;
      if (res?.body?.url) {
        toast.success("Image uploaded successfully!");
        router.refresh();
      } else {
        toast.error("Upload succeeded but no URL was returned.");
      }
    };

    const handleUploadError = (file: unknown, error: unknown) => {
      const err = error as Error;
      toast.error(err?.message || "Failed to upload image. Please try again.");
    };

    uppy.on("upload-success", handleUploadSuccess);
    uppy.on("upload-error", handleUploadError);

    return () => {
      uppy.off("upload-success", handleUploadSuccess);
      uppy.off("upload-error", handleUploadError);
    };
  }, [uppy, animalId, router]);

  if (!canManage) {
    return (
      <div>
        <UploadDisabledPlaceholder />
      </div>
    );
  }

  return (
    <div>
      <Dashboard
        uppy={uppy}
        hideProgressAfterFinish={true}
        note="Images will be saved to the animal's record upon successful upload."
        proudlyDisplayPoweredByUppy={false}
        width={"100%"}
      />
    </div>
  );
};

export default UppyUploader;