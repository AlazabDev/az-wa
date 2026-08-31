import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Phone, Users, Briefcase, CheckCircle2 } from "lucide-react";

const teams = [
  {
    id: 1,
    name: "فريق السباكة",
    leader: "عبدالرحمن محمد",
    members: 6,
    activeTasks: 3,
    status: "متاح",
    specialty: "سباكة",
  },
  {
    id: 2,
    name: "فريق الكهرباء",
    leader: "سعيد الحربي",
    members: 5,
    activeTasks: 2,
    status: "مشغول",
    specialty: "كهرباء",
  },
  {
    id: 3,
    name: "فريق البناء - A",
    leader: "ناصر القحطاني",
    members: 12,
    activeTasks: 1,
    status: "متاح",
    specialty: "بناء",
  },
  {
    id: 4,
    name: "فريق التكييف",
    leader: "فيصل العتيبي",
    members: 4,
    activeTasks: 1,
    status: "متاح",
    specialty: "تكييف",
  },
  {
    id: 5,
    name: "فريق المصاعد",
    leader: "يوسف الشمري",
    members: 3,
    activeTasks: 1,
    status: "مشغول",
    specialty: "مصاعد",
  },
  {
    id: 6,
    name: "فريق العزل والدهان",
    leader: "علي الزهراني",
    members: 8,
    activeTasks: 2,
    status: "متاح",
    specialty: "عزل ودهان",
  },
  {
    id: 7,
    name: "فريق البناء - B",
    leader: "خالد المطيري",
    members: 10,
    activeTasks: 0,
    status: "متاح",
    specialty: "بناء",
  },
  {
    id: 8,
    name: "فريق الحدادة",
    leader: "محمد الغامدي",
    members: 5,
    activeTasks: 1,
    status: "مشغول",
    specialty: "حدادة",
  },
];

const workers = [
  {
    name: "عبدالرحمن محمد",
    role: "رئيس فريق",
    specialty: "سباكة",
    phone: "+966 55 111 2222",
    status: "متاح",
  },
  {
    name: "سعيد الحربي",
    role: "رئيس فريق",
    specialty: "كهرباء",
    phone: "+966 50 333 4444",
    status: "في مهمة",
  },
  {
    name: "ناصر القحطاني",
    role: "رئيس فريق",
    specialty: "بناء",
    phone: "+966 54 555 6666",
    status: "متاح",
  },
  {
    name: "أحمد السعيد",
    role: "فني",
    specialty: "سباكة",
    phone: "+966 56 777 8888",
    status: "متاح",
  },
  {
    name: "خالد العنزي",
    role: "عامل",
    specialty: "بناء",
    phone: "+966 50 999 0000",
    status: "إجازة",
  },
];

export default function Teams() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"teams" | "workers">("teams");

  return (
    <AppLayout
      title="الفرق والعمال"
      subtitle="إدارة فرق العمل وتعيين المهام"
      actions={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 ml-1" />
              {view === "teams" ? "فريق جديد" : "عامل جديد"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>{view === "teams" ? "إنشاء فريق جديد" : "إضافة عامل جديد"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>الاسم</Label>
                <Input className="mt-1" />
              </div>
              <div>
                <Label>التخصص</Label>
                <Select>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر التخصص" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plumbing">سباكة</SelectItem>
                    <SelectItem value="electrical">كهرباء</SelectItem>
                    <SelectItem value="building">بناء</SelectItem>
                    <SelectItem value="ac">تكييف</SelectItem>
                    <SelectItem value="paint">عزل ودهان</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>رقم الهاتف</Label>
                <Input dir="ltr" className="mt-1" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline">إلغاء</Button>
                <Button className="gradient-primary text-primary-foreground">إضافة</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <Button
              size="sm"
              variant={view === "teams" ? "default" : "ghost"}
              onClick={() => setView("teams")}
              className="text-xs"
            >
              الفرق
            </Button>
            <Button
              size="sm"
              variant={view === "workers" ? "default" : "ghost"}
              onClick={() => setView("workers")}
              className="text-xs"
            >
              العمال
            </Button>
          </div>
        </div>

        {view === "teams" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teams
              .filter((t) => t.name.includes(search))
              .map((team) => (
                <Card
                  key={team.id}
                  className="shadow-card hover:shadow-card-hover transition-shadow"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold">{team.name}</CardTitle>
                      <Badge
                        variant={team.status === "متاح" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {team.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Briefcase className="h-3 w-3" />
                      التخصص: {team.specialty}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {team.members} أعضاء • رئيس: {team.leader}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      {team.activeTasks} مهام نشطة
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workers
              .filter((w) => w.name.includes(search))
              .map((worker) => (
                <Card
                  key={worker.name}
                  className="shadow-card hover:shadow-card-hover transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">{worker.name}</h3>
                      <Badge
                        variant={
                          worker.status === "متاح"
                            ? "default"
                            : worker.status === "إجازة"
                              ? "outline"
                              : "secondary"
                        }
                        className="text-xs"
                      >
                        {worker.status}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        {worker.role} • {worker.specialty}
                      </p>
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        <span dir="ltr">{worker.phone}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
