import { Book, Menu, Sunset, Trees, Zap, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const Navbar1 = ({
  logo = {
    url: "/",
    icon: BarChart3,
    title: "ALM Attendance",
  },
  menu = [
    { title: "Dashboard", url: "Dashboard" },
    { title: "Projects", url: "Projects" },
    { title: "Employees", url: "Employees" },
  ],
  mobileExtraLinks = [],
  auth = {
    logout: { text: "Logout", onClick: null },
  },
}) => {
  const renderMenuItem = (item) => {
    if (item.items) {
      return (
        <NavigationMenuItem key={item.title} className="text-muted-foreground">
          <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-80 p-3">
              <NavigationMenuLink>
                {item.items.map((subItem) => (
                  <li key={subItem.title}>
                    <Link
                      className="flex select-none gap-4 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-muted hover:text-accent-foreground"
                      to={createPageUrl(subItem.url)}
                    >
                      {subItem.icon}
                      <div>
                        <div className="text-sm font-semibold">
                          {subItem.title}
                        </div>
                        {subItem.description && (
                          <p className="text-sm leading-snug text-muted-foreground">
                            {subItem.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </NavigationMenuLink>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      );
    }

    return (
      <Link
        key={item.title}
        className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-accent-foreground"
        to={createPageUrl(item.url)}
      >
        {item.title}
      </Link>
    );
  };

  const renderMobileMenuItem = (item) => {
    if (item.items) {
      return (
        <AccordionItem key={item.title} value={item.title} className="border-b-0">
          <AccordionTrigger className="py-0 font-semibold hover:no-underline">
            {item.title}
          </AccordionTrigger>
          <AccordionContent className="mt-2">
            {item.items.map((subItem) => (
              <Link
                key={subItem.title}
                className="flex select-none gap-4 rounded-md p-3 leading-none outline-none transition-colors hover:bg-muted hover:text-accent-foreground"
                to={createPageUrl(subItem.url)}
              >
                {subItem.icon}
                <div>
                  <div className="text-sm font-semibold">{subItem.title}</div>
                  {subItem.description && (
                    <p className="text-sm leading-snug text-muted-foreground">
                      {subItem.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </AccordionContent>
        </AccordionItem>
      );
    }

    return (
      <Link key={item.title} to={createPageUrl(item.url)} className="font-semibold">
        {item.title}
      </Link>
    );
  };

  const LogoIcon = logo.icon;

  return (
    <section className="py-4">
      <div className="container">
        <nav className="hidden justify-between lg:flex">
          <div className="flex items-center gap-6">
            <Link to={createPageUrl(logo.url)} className="flex items-center gap-2">
              <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl">
                <LogoIcon className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-semibold">{logo.title}</span>
            </Link>
            <div className="flex items-center">
              <NavigationMenu>
                <NavigationMenuList>
                  {menu.map((item) => renderMenuItem(item))}
                </NavigationMenuList>
              </NavigationMenu>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={auth.logout.onClick}
            >
              {auth.logout.text}
            </Button>
          </div>
        </nav>
        <div className="block lg:hidden">
          <div className="flex items-center justify-between">
            <Link to={createPageUrl(logo.url)} className="flex items-center gap-2">
              <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl">
                <LogoIcon className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-semibold">{logo.title}</span>
            </Link>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>
                    <Link to={createPageUrl(logo.url)} className="flex items-center gap-2">
                      <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl">
                        <LogoIcon className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-lg font-semibold">
                        {logo.title}
                      </span>
                    </Link>
                  </SheetTitle>
                </SheetHeader>
                <div className="my-6 flex flex-col gap-6">
                  <Accordion
                    type="single"
                    collapsible
                    className="flex w-full flex-col gap-4"
                  >
                    {menu.map((item) => renderMobileMenuItem(item))}
                  </Accordion>
                  {mobileExtraLinks.length > 0 && (
                    <div className="border-t py-4">
                      <div className="grid grid-cols-2 justify-start">
                        {mobileExtraLinks.map((link, idx) => (
                          <Link
                            key={idx}
                            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-accent-foreground"
                            to={createPageUrl(link.url)}
                          >
                            {link.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    <Button onClick={auth.logout.onClick}>
                      {auth.logout.text}
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </section>
  );
};

export { Navbar1 };