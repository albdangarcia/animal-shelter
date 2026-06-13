import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button'; // Import the Button component

// The props for the component
interface PageNotFoundOrAccessDeniedProps {
  type: 'notFound' | 'accessDenied' | 'genericError';
  actionButton?: React.ReactNode;
  itemName?: string;
  redirectUrl?: string;
  buttonGoTo?: string;
}

// The structure for each error type's content
interface ErrorContent {
  errorCode: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const errorTypeDetails: Record<'notFound' | 'accessDenied' | 'genericError', ErrorContent> = {
  notFound: {
    errorCode: '404',
    title: 'Page Not Found',
    description:
      "Oops! The page you're looking for doesn't seem to exist. It might have been moved, deleted, or you might have mistyped the URL.",
    icon: (
      <Image
        src="/icons/giraffe.svg"
        alt="A giraffe looking surprised."
        width={80}
        height={80}
        className="mb-5 sm:mb-6 size-20 sm:size-50"
        aria-hidden="true"
        priority
      />
    ),
  },
  accessDenied: {
    errorCode: '403',
    title: 'Access Denied',
    description:
      'You do not have the necessary permissions to view this page. If you believe this is an error, please contact an administrator or try signing in.',
    icon: (
      <Image
        src="/icons/cobra.svg"
        alt="A cobra in a defensive stance."
        width={80}
        height={80}
        className="mb-5 sm:mb-6 size-20 sm:size-50"
        aria-hidden="true"
        priority
      />
    ),
  },
  genericError: {
    errorCode: '500',
    title: 'Something Went Wrong',
    description: "We've encountered an unexpected server error. Please try refreshing the page or click the button below to try again.",
    icon: (
        <Image
        src="/icons/racoon.svg"
        alt="A racoon looking surprised."
        width={80}
        height={80}
        className="mb-5 sm:mb-6 size-20 sm:size-50"
        aria-hidden="true"
        priority
      />
    ),
  },
};

const PageNotFoundOrAccessDenied = ({ type, actionButton, itemName, redirectUrl, buttonGoTo }: PageNotFoundOrAccessDeniedProps) => {
  const details = errorTypeDetails[type] || errorTypeDetails.notFound;
  const { errorCode, description, icon } = details;

  const title = type === 'notFound' && itemName ? `${itemName} Not Found` : details.title;

  // Updated to use the shadcn/ui Button component
  const defaultActionButton = (
    <Button asChild className="mt-8">
      <Link href={redirectUrl || '/'}>
        {buttonGoTo ? `Back to ${buttonGoTo}` : 'Go to Homepage'}
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-12 sm:py-16 md:py-20">
      {icon}
      <p className="text-sm sm:text-base font-semibold text-indigo-600 uppercase tracking-wide">
        {errorCode}
      </p>
      <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-base text-gray-600 max-w-md sm:max-w-lg">
        {description}
      </p>

      {actionButton !== null && (actionButton === undefined ? defaultActionButton : actionButton)}
    </div>
  );
};

export default PageNotFoundOrAccessDenied;